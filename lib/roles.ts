// Admin role hierarchy for the newsletter admin panel.
//
// All four roles can sign into the admin area; capability differs by rank:
//   owner  — full control, incl. managing other admins (invite / change role /
//            remove) and transferring/granting ownership.
//   admin  — everything an owner can do EXCEPT it can't remove/downgrade an
//            owner. Can manage editors/viewers/admins and invite new members.
//   editor — can manage subscribers + newsletters (create/edit/send), but can't
//            manage team members, API keys, or other privileged settings.
//   viewer — read-only access to the admin panel.
//
// The `role` column already exists on the better-auth `user` table (nullable
// text), so introducing this hierarchy needs NO schema migration. Existing
// admins created before this feature have role "admin" and keep full access.

export const ADMIN_ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

// Higher number = more privilege.
const RANK: Record<AdminRole, number> = {
    owner: 40,
    admin: 30,
    editor: 20,
    viewer: 10,
};

// Any of these four roles grants access to the admin area at all.
export function isAdminRole(role: unknown): role is AdminRole {
    return typeof role === "string" && (ADMIN_ROLES as readonly string[]).includes(role);
}

// Normalize an arbitrary stored role to a known AdminRole. Legacy/unknown
// non-empty roles are treated as "admin" (the historical single-tier default)
// so nobody gets locked out by this migration; falsy → null (no access).
export function normalizeRole(role: unknown): AdminRole | null {
    if (isAdminRole(role)) return role;
    if (typeof role === "string" && role.trim().length > 0) return "admin";
    return null;
}

export function roleRank(role: unknown): number {
    const r = normalizeRole(role);
    return r ? RANK[r] : 0;
}

// True when `role` is at least as privileged as `min`.
export function hasRoleAtLeast(role: unknown, min: AdminRole): boolean {
    return roleRank(role) >= RANK[min];
}

// Can `actorRole` assign `targetRole` to someone? You can only grant a role
// strictly below your own rank, and only owners can grant "owner".
export function canAssignRole(actorRole: unknown, targetRole: AdminRole): boolean {
    const actorRank = roleRank(actorRole);
    if (targetRole === "owner") return normalizeRole(actorRole) === "owner";
    return actorRank > RANK[targetRole];
}

// --- Invite-specific capability rules ---------------------------------------
// The invite flow has stricter rules than role reassignment:
//   * `owner` is a SINGLE, non-transferable role. It can NEVER be granted via
//     an invite — not even by the owner. Ownership is not created by invites.
//   * Only owner + admin may invite at all. Editors and viewers cannot.
//   * An admin's MAX grantable invite role is `admin` (admin/editor/viewer).
//     An owner may invite admin/editor/viewer (everything below owner).

// Roles that can be granted through an invite (owner is deliberately excluded).
export const INVITABLE_ROLES = ["admin", "editor", "viewer"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function isInvitableRole(role: unknown): role is InvitableRole {
    return typeof role === "string" && (INVITABLE_ROLES as readonly string[]).includes(role);
}

// Can `actorRole` send invites at all? Only owner + admin.
export function canInvite(actorRole: unknown): boolean {
    return hasRoleAtLeast(actorRole, "admin");
}

// Can `actorRole` invite someone as `targetRole`? Enforces every invite rule:
// owner is never invitable, only owner/admin may invite, and the granted role
// must be within the actor's allowance (owner → admin/editor/viewer;
// admin → admin/editor/viewer, capped at admin).
export function canInviteRole(actorRole: unknown, targetRole: unknown): boolean {
    if (!canInvite(actorRole)) return false;
    if (!isInvitableRole(targetRole)) return false; // rejects "owner" + junk
    const actor = normalizeRole(actorRole);
    if (actor === "owner") return true; // any invitable role
    if (actor === "admin") return RANK[targetRole] <= RANK["admin"]; // max = admin
    return false;
}

// The set of roles a given actor may grant through the invite dialog. Owner is
// never in this list, so the UI can never offer it.
export function invitableRolesFor(actorRole: unknown): InvitableRole[] {
    return INVITABLE_ROLES.filter((r) => canInviteRole(actorRole, r));
}

// Can `actorRole` modify/remove a member who currently has `subjectRole`?
// You may only act on members strictly below your own rank (an admin can't
// remove another admin or an owner; an owner can act on anyone below owner).
export function canManageMemberWithRole(actorRole: unknown, subjectRole: unknown): boolean {
    return roleRank(actorRole) > roleRank(subjectRole);
}

export const ROLE_LABELS: Record<AdminRole, string> = {
    owner: "Owner",
    admin: "Admin",
    editor: "Editor",
    viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
    owner: "Full control, including managing other admins.",
    admin: "Manage everything except owners.",
    editor: "Manage subscribers and newsletters; no team or key access.",
    viewer: "Read-only access to the admin panel.",
};
