// Idea Lab access control — the Idea Lab is PRIVATE to Luke only.
//
// Every Idea Lab surface (tRPC router, admin page, and the bot push endpoint)
// gates on this single check so the rule lives in one place. It is intentionally
// STRICTER than the owner role: even another owner/admin must ALSO match the
// allow-listed email. Configurable via IDEA_LAB_OWNER_EMAIL; defaults to Luke's.
export const IDEA_LAB_OWNER_EMAIL = (
    process.env.IDEA_LAB_OWNER_EMAIL || "ltlukas@icloud.com"
)
    .trim()
    .toLowerCase();

// True only for Luke's exact email (case-insensitive). Anyone else — including
// other admins/owners — is denied.
export function isIdeaLabOwner(email: unknown): boolean {
    return (
        typeof email === "string" &&
        email.trim().toLowerCase() === IDEA_LAB_OWNER_EMAIL
    );
}
