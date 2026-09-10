import { adminProcedure, router } from "@/trpc/server";
import { z } from "zod";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { user } from "@/db/schemas/auth";
import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
    ADMIN_ROLES,
    type AdminRole,
    canAssignRole,
    canManageMemberWithRole,
    normalizeRole,
} from "@/lib/roles";

// Team / multi-admin management. Every member of the `user` table is an admin
// of the panel; this router lets owners (and admins, for lower roles) invite,
// re-role, and remove other members. All guards are enforced server-side by
// role RANK so a lower-ranked actor can never escalate or touch a peer/superior.

const roleEnum = z.enum(ADMIN_ROLES);

// FIRST-OWNER BOOTSTRAP: multi-admin roles are additive on top of a system
// that historically had a single "admin". If NO owner exists yet, the existing
// admin(s) are treated as owner for team-management purposes so nobody is
// locked out of designating the first real owner. Once any owner exists, only
// owners can manage the team — a plain admin no longer qualifies.
async function effectiveActorRole(ctx: any): Promise<AdminRole> {
    const role = normalizeRole(ctx.adminRole) ?? "admin";
    if (role === "admin") {
        const [{ n }] = await ctx.db
            .select({ n: count() })
            .from(user)
            .where(eq(user.role, "owner"));
        if (Number(n) === 0) return "owner";
    }
    return role;
}

function requireTeamManager(role: AdminRole) {
    if (role !== "owner") {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only owners can manage team members.",
        });
    }
}

export const adminTeamRouter = router({
    // Any admin-area role can SEE the team roster (read-only for viewers). We
    // don't expose anything sensitive — just id/name/email/role/timestamps.
    list: adminProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                createdAt: user.createdAt,
            })
            .from(user)
            .orderBy(desc(user.createdAt));

        // Report the EFFECTIVE actor role (see effectiveActorRole) so the UI
        // surfaces management controls for a first-owner bootstrap admin.
        const actorRole = await effectiveActorRole(ctx);
        return {
            actorId: (ctx as any).adminUserId as string,
            actorRole,
            members: rows.map((r) => ({
                ...r,
                // Normalize legacy/unknown roles to a known tier for display.
                role: normalizeRole(r.role) ?? "admin",
            })),
        };
    }),

    // Invite = create a new admin user with an initial password (shown ONCE,
    // like an API key). Owner-gated. You can only assign a role you're allowed
    // to grant (never above your own rank; only owners can mint owners).
    invite: adminProcedure
        .input(
            z.object({
                email: z.string().trim().toLowerCase().email(),
                name: z.string().trim().min(1).max(120),
                role: roleEnum.default("editor"),
                password: z.string().min(8).max(200).optional(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const actorRole = await effectiveActorRole(ctx);
            requireTeamManager(actorRole);
            if (!canAssignRole(actorRole, input.role)) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: `You can't assign the "${input.role}" role.`,
                });
            }

            const existing = await ctx.db
                .select({ id: user.id })
                .from(user)
                .where(eq(user.email, input.email));
            if (existing.length > 0) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "A member with that email already exists.",
                });
            }

            // Generate a strong temporary password if the inviter didn't supply
            // one. Surfaced to the inviter exactly once so they can share it.
            const tempPassword =
                input.password ?? `Pl-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

            // Authorization is already enforced by ownerProcedure above. Create
            // the user + hashed credential via better-auth's internal adapter
            // (its public admin-plugin createUser only recognizes the "admin"
            // role for permission checks, so it rejects our "owner" tier). The
            // internal adapter keeps password hashing identical to normal
            // sign-up while letting us set our own role hierarchy.
            let createdId: string;
            try {
                const authCtx: any = await auth.$context;
                const hashed: string = await authCtx.password.hash(tempPassword);
                const created: any = await authCtx.internalAdapter.createUser({
                    email: input.email,
                    name: input.name,
                    role: input.role,
                    emailVerified: false,
                });
                createdId = created?.id;
                if (!createdId) throw new Error("no id returned");
                await authCtx.internalAdapter.createAccount({
                    userId: createdId,
                    providerId: "credential",
                    accountId: createdId,
                    password: hashed,
                });
            } catch (e: any) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: e?.message
                        ? `Couldn't create the member: ${e.message}`
                        : "Couldn't create the member.",
                });
            }

            // Ensure the stored role is exactly our intended tier.
            await ctx.db.update(user).set({ role: input.role }).where(eq(user.id, createdId));

            await recordAudit(ctx, {
                action: "team.invite",
                targetType: "user",
                targetId: createdId,
                metadata: { email: input.email, role: input.role },
            });

            return {
                id: createdId,
                email: input.email,
                name: input.name,
                role: input.role,
                // The ONLY time this password is exposed.
                tempPassword,
            };
        }),

    // Change a member's role. Owner-gated. Can't touch yourself, can't act on a
    // member at/above your rank, and can't grant a role above what you may.
    updateRole: adminProcedure
        .input(z.object({ userId: z.string().min(1), role: roleEnum }))
        .mutation(async ({ input, ctx }) => {
            const actorId = (ctx as any).adminUserId as string;
            const actorRole = await effectiveActorRole(ctx);
            requireTeamManager(actorRole);

            if (input.userId === actorId) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "You can't change your own role.",
                });
            }

            const [target] = await ctx.db
                .select({ id: user.id, email: user.email, role: user.role })
                .from(user)
                .where(eq(user.id, input.userId));
            if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });

            const currentRole = normalizeRole(target.role) ?? "admin";
            if (!canManageMemberWithRole(actorRole, currentRole)) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "You can't modify a member at or above your role.",
                });
            }
            if (!canAssignRole(actorRole, input.role)) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: `You can't assign the "${input.role}" role.`,
                });
            }

            // Don't allow removing the LAST owner via a downgrade.
            if (currentRole === "owner" && input.role !== "owner") {
                const owners = await ctx.db
                    .select({ id: user.id })
                    .from(user)
                    .where(eq(user.role, "owner"));
                if (owners.length <= 1) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "There must be at least one owner.",
                    });
                }
            }

            await ctx.db.update(user).set({ role: input.role }).where(eq(user.id, input.userId));

            await recordAudit(ctx, {
                action: "team.updateRole",
                targetType: "user",
                targetId: input.userId,
                metadata: { email: target.email, from: currentRole, to: input.role },
            });

            return { ok: true };
        }),

    // Remove a member. Owner-gated. Same rank guards; can't remove yourself or
    // the last owner.
    remove: adminProcedure
        .input(z.object({ userId: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            const actorId = (ctx as any).adminUserId as string;
            const actorRole = await effectiveActorRole(ctx);
            requireTeamManager(actorRole);

            if (input.userId === actorId) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "You can't remove yourself.",
                });
            }

            const [target] = await ctx.db
                .select({ id: user.id, email: user.email, role: user.role })
                .from(user)
                .where(eq(user.id, input.userId));
            if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });

            const currentRole = normalizeRole(target.role) ?? "admin";
            if (!canManageMemberWithRole(actorRole, currentRole)) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "You can't remove a member at or above your role.",
                });
            }

            if (currentRole === "owner") {
                const owners = await ctx.db
                    .select({ id: user.id })
                    .from(user)
                    .where(and(eq(user.role, "owner"), ne(user.id, input.userId)));
                if (owners.length === 0) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "There must be at least one owner.",
                    });
                }
            }

            // Authorization already enforced by ownerProcedure + rank guard.
            // Delete the user row directly; the FK cascades on `session` and
            // `account` clean up their credentials/sessions automatically.
            await ctx.db.delete(user).where(eq(user.id, input.userId));

            await recordAudit(ctx, {
                action: "team.remove",
                targetType: "user",
                targetId: input.userId,
                metadata: { email: target.email, role: currentRole },
            });

            return { ok: true };
        }),
});
