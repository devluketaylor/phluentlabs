import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.SUBSCRIBER_TOKEN_SECRET!);

type Scope = "confirm" | "unsub" | "prefs"

export const signSubscriberToken = async (
    payload: { subId: string, email: string, scope: Scope },
    // Optional expiry override (jose duration string, e.g. "7d"). Used by the
    // double opt-in REMINDER, which is sent days after signup: the original
    // 24h confirm token is long gone, so the reminder mints a fresh confirm
    // token with a longer life so the reminder link actually works.
    expiresIn?: string,
) => {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(expiresIn ?? (payload.scope === "confirm" ? "24h" : "30d"))
        // Note: "unsub" and "prefs" tokens are long-lived (30d) so links in
        // older emails keep working; "confirm" is short-lived (24h) unless an
        // explicit longer expiry is passed (reminder flow).
        .sign(secret)
}

export const verifySubscriberToken = async (token: string) => {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    return payload as { subId: string; email: string; scope: Scope; iat: number; exp: number; };
}