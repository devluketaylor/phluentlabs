import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.SUBSCRIBER_TOKEN_SECRET!);

type Scope = "confirm" | "unsub"

export const signSubscriberToken = async (payload: { subId: string, email: string, scope: Scope }) => {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(payload.scope === "confirm" ? "24h" : "30d")
        .sign(secret)
}

export const verifySubscriberToken = async (token: string) => {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    return payload as { subId: string; email: string; scope: Scope; iat: number; exp: number; };
}