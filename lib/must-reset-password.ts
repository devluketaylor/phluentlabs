import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Path of the forced change-password screen. A member with a pending temp
// password is redirected here and blocked from the rest of the app until they
// set a real password (which clears the `mustResetPassword` flag).
export const CHANGE_PASSWORD_PATH = "/auth/change-password";

// Read the reset flag off a better-auth session user. The flag is exposed as an
// additionalField (see lib/auth.ts), but stay defensive about its shape.
export function sessionMustResetPassword(session: unknown): boolean {
    const user = (session as any)?.user;
    return user?.mustResetPassword === true;
}

// Server-side gate for authenticated areas. If the signed-in member still has a
// pending temporary password, redirect them to the change-password screen so
// they cannot reach any protected page first. No-op for guests (auth is handled
// by the caller's own session check) and for members who've already reset.
export async function enforcePasswordReset(): Promise<void> {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session && sessionMustResetPassword(session)) {
        redirect(CHANGE_PASSWORD_PATH);
    }
}
