import { adminProcedure, router } from "@/trpc/server";
import { z } from "zod";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { user } from "@/db/schemas/auth";
import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
    ADMIN_ROLES,
    INVITABLE_ROLES,
    type AdminRole,
    canAssignRole,
    canInvite,
    canInviteRole,
    canManageMemberWithRole,
    normalizeRole,
} from "@/lib/roles";
import { Resend } from "resend";
import { renderTeamInviteEmail } from "@/lib/emails/team-invite";

const resend = new Resend(process.env.RESEND_API_KEY);

// Team / multi-admin management. Every member of the `user` table is an admin
// of the panel; this router lets owners (and admins, for lower roles) invite,
// re-role, and remove other members. All guards are enforced server-side by
// role RANK so a lower-ranked actor can never escalate or touch a peer/superior.

const roleEnum = z.enum(ADMIN_ROLES);
// Invites may ONLY grant admin/editor/viewer. `owner` is a single,
// non-transferable role and is rejected at the schema boundary too, so a
// hand-crafted request can never even reach the handler with role="owner".
const inviteRoleEnum = z.enum(INVITABLE_ROLES);

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

    // Invite = create a new admin user with a generated TEMPORARY password that
    // is EMAILED to them (never returned to the client). Owner + admin may
    // invite; an admin's max grantable role is `admin`; `owner` can NEVER be
    // granted via an invite (enforced by the schema enum AND canInviteRole).
    // The new member is flagged `mustResetPassword` so they're forced to set a
    // real password on first login.
    invite: adminProcedure
        .input(
            z.object({
                email: z.string().trim().toLowerCase().email(),
                name: z.string().trim().min(1).max(120),
                role: inviteRoleEnum.default("editor"),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const actorRole = await effectiveActorRole(ctx);
            // Only owner/admin may invite (editors + viewers cannot).
            if (!canInvite(actorRole)) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "You don't have permission to invite members.",
                });
            }
            // Enforce the invite grant rules server-side: never owner, admin
            // capped at admin. (inviteRoleEnum already rejects "owner", this is
            // the belt-and-suspenders capability check.)
            if (!canInviteRole(actorRole, input.role)) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: `You can't invite someone as "${input.role}".`,
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

            // Generate a strong temporary password. It is NEVER returned to the
            // client — it is emailed to the invitee, who must change it on first
            // login. Mixed-case + digits + a symbol to satisfy typical policies.
            const tempPassword = `Pl-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

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
                // Force a password change on first login.
                await authCtx.internalAdapter.updateUser(createdId, {
                    mustResetPassword: true,
                });
            } catch (e: any) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: e?.message
                        ? `Couldn't create the member: ${e.message}`
                        : "Couldn't create the member.",
                });
            }

            // Ensure the stored role + reset flag are exactly what we intend
            // (belt-and-suspenders in case the adapter ignored a field above).
            await ctx.db
                .update(user)
                .set({ role: input.role, mustResetPassword: true })
                .where(eq(user.id, createdId));

            // Email the invite + temporary password via the shared Resend layer.
            // We do NOT return the password to the client — it only travels by
            // email. A send failure is surfaced but the account still exists
            // (an owner can re-issue by removing + re-inviting).
            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://phluentlabs.com";
            const loginUrl = `${appUrl.replace(/\/$/, "")}/auth/login`;
            const { subject, html, text } = renderTeamInviteEmail({
                name: input.name,
                email: input.email,
                tempPassword,
                role: input.role,
                loginUrl,
                invitedBy: (ctx as any).adminEmail ?? null,
            });
            let emailSent = false;
            let emailError: string | null = null;
            try {
                const res: any = await resend.emails.send({
                    from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
                    to: input.email,
                    subject,
                    html,
                    text,
                });
                if (res?.error) {
                    emailError = res.error?.message ?? String(res.error);
                } else {
                    emailSent = true;
                }
            } catch (e: any) {
                emailError = e?.message ?? "Failed to send invite email.";
            }

            await recordAudit(ctx, {
                action: "team.invite",
                targetType: "user",
                targetId: createdId,
                metadata: { email: input.email, role: input.role, emailSent },
            });

            return {
                id: createdId,
                email: input.email,
                name: input.name,
                role: input.role,
                // Whether the invite email actually sent. The temp password is
                // intentionally NOT returned — it only travels by email.
                emailSent,
                emailError,
            };
        }),

    // First-login forced password change. The invited member signs in with the
    // temp password (which sets `mustResetPassword`), is gated to the change-
    // password screen, and calls this to set a real password. We delegate the
    // credential rotation to better-auth's own `changePassword` (verifies the
    // current/temp password + re-hashes), then clear the reset flag. Any
    // admin-area role may call this for THEIR OWN account.
    changeInitialPassword: adminProcedure
        .input(
            z.object({
                currentPassword: z.string().min(1).max(200),
                newPassword: z.string().min(8).max(200),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const actorId = (ctx as any).adminUserId as string;
            try {
                // Verifies currentPassword against the signed-in user + rehashes
                // the new one. Throws APIError on a wrong current password.
                await auth.api.changePassword({
                    headers: (ctx as any).headers as Headers,
                    body: {
                        currentPassword: input.currentPassword,
                        newPassword: input.newPassword,
                        revokeOtherSessions: true,
                    },
                });
            } catch (e: any) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: e?.message ?? "Couldn't change your password.",
                });
            }

            // Clear the forced-reset flag so the gate lets them through.
            await ctx.db
                .update(user)
                .set({ mustResetPassword: false })
                .where(eq(user.id, actorId));

            await recordAudit(ctx, {
                action: "team.resetInitialPassword",
                targetType: "user",
                targetId: actorId,
            });

            return { ok: true };
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
