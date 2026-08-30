// Referral-code generation for the referral program.
//
// Codes are short, URL-safe, and case-insensitive-friendly: we use an
// unambiguous base32-ish alphabet (no 0/O/1/I/L) so they read cleanly in a
// shared link and are hard to typo. Uniqueness is enforced by the DB unique
// constraint on subscribers.referral_code; callers retry on the (rare)
// collision.

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 31 chars, no ambiguous glyphs

export function generateReferralCode(length = 8): string {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    let out = "";
    for (let i = 0; i < length; i++) {
        out += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return out;
}
