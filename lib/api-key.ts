// API-key generation + hashing for the public subscribe API.
//
// SECURITY MODEL
// - The raw key is high-entropy random and shown to the admin exactly once.
// - We persist ONLY the SHA-256 hash of the raw key; the plaintext never
//   touches the DB or the logs.
// - A short, non-secret PREFIX (first chars of the raw key) is stored in the
//   clear purely so the admin can disambiguate keys in the UI.
// - Verification hashes the presented key and compares hashes; because the
//   lookup is by the (indexed, unique) hash the comparison is effectively
//   constant-time at the DB level, and we never branch on the raw secret.

// Human-readable, URL-safe prefix so keys are recognizable at a glance.
const KEY_PREFIX = "pk_live_";
// Unambiguous alphabet (no 0/O/1/I/l) for the random body.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
const RANDOM_LEN = 40;

export function generateApiKey(): string {
    const bytes = new Uint8Array(RANDOM_LEN);
    crypto.getRandomValues(bytes);
    let body = "";
    for (let i = 0; i < RANDOM_LEN; i++) {
        body += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return KEY_PREFIX + body;
}

// SHA-256 hex of the raw key. Uses Web Crypto (available in the Node/Edge
// runtimes Next uses) so there's no node:crypto dependency.
export async function hashApiKey(raw: string): Promise<string> {
    const data = new TextEncoder().encode(raw);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

// Short, non-secret display prefix: the fixed prefix + a few body chars.
export function keyDisplayPrefix(raw: string): string {
    return raw.slice(0, KEY_PREFIX.length + 4);
}
