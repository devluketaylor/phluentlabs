// Shared, framework-agnostic helpers for importing subscribers from CSV
// exports produced by other newsletter platforms (Substack, beehiiv,
// Mailchimp) as well as our own generic export format.
//
// Kept pure (no React / no DB) so it can be unit-tested and reused by both
// the client import UI and any server-side validation.

export type ImportStatus = "pending" | "subscribed" | "unsubscribed";

export type ImportRow = {
    email: string;
    firstName: string | null;
    lastName: string | null;
    status?: ImportStatus;
    tags: string[];
};

export type ImportSource = "auto" | "generic" | "substack" | "beehiiv" | "mailchimp";

export const IMPORT_SOURCES: { value: ImportSource; label: string }[] = [
    { value: "auto", label: "Auto-detect" },
    { value: "generic", label: "Generic (email, first, last, status)" },
    { value: "substack", label: "Substack export" },
    { value: "beehiiv", label: "beehiiv export" },
    { value: "mailchimp", label: "Mailchimp export" },
];

const VALID_STATUSES: ImportStatus[] = ["pending", "subscribed", "unsubscribed"];

// ---------------------------------------------------------------------------
// CSV parsing (RFC-4180-ish): quoted fields, embedded commas, escaped quotes
// (""), and \r\n / \n line endings. Strips a leading BOM.
// ---------------------------------------------------------------------------
export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let field = "";
    let row: string[] = [];
    let inQuotes = false;
    const src = text.replace(/^\uFEFF/, "");

    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (inQuotes) {
            if (ch === '"') {
                if (src[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ",") {
            row.push(field);
            field = "";
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && src[i + 1] === "\n") i++;
            row.push(field);
            field = "";
            rows.push(row);
            row = [];
        } else {
            field += ch;
        }
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ---------------------------------------------------------------------------
// Status normalization: each platform uses a different vocabulary. Map them
// all onto our three-value vocab.
// ---------------------------------------------------------------------------
export function normalizeStatus(raw: string | undefined): ImportStatus | undefined {
    if (!raw) return undefined;
    const s = raw.trim().toLowerCase();
    if (!s) return undefined;

    // Our own vocab / common synonyms.
    if (VALID_STATUSES.includes(s as ImportStatus)) return s as ImportStatus;

    // Subscribed-ish.
    if (
        [
            "active",
            "activated",
            "subscribe",
            "true",
            "yes",
            "confirmed",
            "opted_in",
            "opt-in",
            "verified",
            "member",
        ].includes(s)
    ) {
        return "subscribed";
    }

    // Unsubscribed-ish.
    if (
        [
            "inactive",
            "unsubscribe",
            "unsub",
            "cleaned",
            "bounced",
            "removed",
            "archived",
            "deleted",
            "false",
            "no",
            "complained",
            "spam",
        ].includes(s)
    ) {
        return "unsubscribed";
    }

    // Pending-ish.
    if (["pending", "unconfirmed", "invited", "waiting", "double_optin", "non-subscriber"].includes(s)) {
        return "pending";
    }

    // Mailchimp's "transactional" and anything unknown → leave undefined so the
    // server default applies.
    return undefined;
}

// Split a raw tags/labels cell (platforms use comma, semicolon, or pipe).
export function parseTagsCell(raw: string | undefined): string[] {
    if (!raw) return [];
    return raw
        .split(/[,;|]/)
        .map((t) => t.trim())
        .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Header-based column detection. Returns a set of column indexes for the
// fields we care about, given the (lower-cased, trimmed) header row.
// ---------------------------------------------------------------------------
type ColMap = {
    email: number;
    firstName: number;
    lastName: number;
    fullName: number;
    status: number;
    tags: number;
};

function findCol(header: string[], names: string[]): number {
    return header.findIndex((c) => names.includes(c));
}

function detectColumns(header: string[]): ColMap {
    return {
        email: findCol(header, ["email", "e-mail", "email address", "email_address"]),
        firstName: findCol(header, ["first_name", "first name", "firstname", "first", "given name"]),
        lastName: findCol(header, ["last_name", "last name", "lastname", "last", "surname", "family name"]),
        // Substack / beehiiv sometimes ship a single "name" column.
        fullName: findCol(header, ["name", "full name", "full_name", "display name"]),
        status: findCol(header, [
            "status",
            "active_subscription",
            "subscription_status",
            "subscribed",
            "state",
            "member rating", // not a status but guards against false-positives below
        ].filter((n) => n !== "member rating")),
        tags: findCol(header, ["tags", "labels", "segments", "tiers", "tier", "groups"]),
    };
}

// Best-effort format auto-detection from the header row.
export function detectSource(header: string[]): Exclude<ImportSource, "auto"> {
    const set = new Set(header);
    // Mailchimp audience exports use Title-Case headers like "Email Address".
    if (set.has("email address") && (set.has("first name") || set.has("last name") || set.has("member rating"))) {
        return "mailchimp";
    }
    // beehiiv uses snake_case with a "status" + "created_at"/"tiers".
    if (set.has("email") && set.has("status") && (set.has("created_at") || set.has("tiers") || set.has("subscription_tier"))) {
        return "beehiiv";
    }
    // Substack exports typically have "email" + "active_subscription"/"expiry".
    if (set.has("email") && (set.has("active_subscription") || set.has("expiry") || set.has("subscribed_at"))) {
        return "substack";
    }
    return "generic";
}

function splitFullName(full: string): { firstName: string | null; lastName: string | null } {
    const parts = full.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: null, lastName: null };
    if (parts.length === 1) return { firstName: parts[0], lastName: null };
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// ---------------------------------------------------------------------------
// Turn parsed CSV rows into ImportRows, honouring the chosen source (or
// auto-detecting). Returns the resolved source alongside the rows so the UI
// can show what it detected.
// ---------------------------------------------------------------------------
export function rowsToImport(
    parsed: string[][],
    source: ImportSource = "auto"
): { rows: ImportRow[]; detected: Exclude<ImportSource, "auto"> } {
    if (parsed.length === 0) return { rows: [], detected: "generic" };

    const header = parsed[0].map((c) => c.trim().toLowerCase());
    const hasHeader =
        header.includes("email") ||
        header.includes("email address") ||
        header.includes("e-mail");

    const detected: Exclude<ImportSource, "auto"> =
        source === "auto" ? (hasHeader ? detectSource(header) : "generic") : source;

    let cols: ColMap;
    let dataRows: string[][];

    if (hasHeader) {
        cols = detectColumns(header);
        dataRows = parsed.slice(1);
    } else {
        // Positional fallback: email, first, last, status.
        cols = { email: 0, firstName: 1, lastName: 2, fullName: -1, status: 3, tags: -1 };
        dataRows = parsed;
    }

    const out: ImportRow[] = [];
    for (const r of dataRows) {
        const email = (cols.email >= 0 ? r[cols.email] : "")?.trim() ?? "";
        if (!email) continue;

        let firstName = cols.firstName >= 0 ? r[cols.firstName]?.trim() || null : null;
        let lastName = cols.lastName >= 0 ? r[cols.lastName]?.trim() || null : null;

        // Fall back to a single full-name column when first/last are absent.
        if (!firstName && !lastName && cols.fullName >= 0) {
            const split = splitFullName(r[cols.fullName]?.trim() ?? "");
            firstName = split.firstName;
            lastName = split.lastName;
        }

        const status = normalizeStatus(cols.status >= 0 ? r[cols.status] : undefined);
        const tags = cols.tags >= 0 ? parseTagsCell(r[cols.tags]) : [];

        out.push({ email, firstName, lastName, status, tags });
    }
    return { rows: out, detected };
}

// ---------------------------------------------------------------------------
// Dry-run classification helper (pure). Given import rows and the set of
// already-existing emails (lower-cased), classify each into add / skip
// (in-file duplicate or invalid) / conflict (already exists in DB).
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type DryRun = {
    toAdd: ImportRow[];
    add: number;
    conflict: number;
    duplicateInFile: number;
    invalid: number;
    total: number;
};

export function classifyImport(rows: ImportRow[], existingEmails: Set<string>): DryRun {
    const seen = new Set<string>();
    const toAdd: ImportRow[] = [];
    let conflict = 0;
    let duplicateInFile = 0;
    let invalid = 0;

    for (const r of rows) {
        const email = r.email.trim().toLowerCase();
        if (!email || !EMAIL_RE.test(email)) {
            invalid++;
            continue;
        }
        if (seen.has(email)) {
            duplicateInFile++;
            continue;
        }
        seen.add(email);
        if (existingEmails.has(email)) {
            conflict++;
            continue;
        }
        toAdd.push({ ...r, email });
    }

    return {
        toAdd,
        add: toAdd.length,
        conflict,
        duplicateInFile,
        invalid,
        total: rows.length,
    };
}
