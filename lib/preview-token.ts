import { SignJWT, jwtVerify } from "jose";

// Signed, expiring tokens for sharing a proof of an UNSENT draft. Reuses the
// same HS256 secret as subscriber tokens (SUBSCRIBER_TOKEN_SECRET), but with a
// distinct payload shape (newsletterId, not subId) and a dedicated "preview"
// scope so a preview token can never be mistaken for / used as an unsub/prefs
// token and vice-versa.
const secret = new TextEncoder().encode(process.env.SUBSCRIBER_TOKEN_SECRET!);

type PreviewScope = "preview";

export const signPreviewToken = async (payload: { newsletterId: string }) => {
    return new SignJWT({ newsletterId: payload.newsletterId, scope: "preview" satisfies PreviewScope })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        // Short-lived by design: a proof link should expire so a leaked/forwarded
        // preview of an unpublished draft doesn't stay live indefinitely.
        .setExpirationTime("14d")
        .sign(secret);
};

export const verifyPreviewToken = async (token: string) => {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (payload.scope !== "preview") {
        throw new Error("Invalid token scope");
    }
    return payload as { newsletterId: string; scope: PreviewScope; iat: number; exp: number };
};
