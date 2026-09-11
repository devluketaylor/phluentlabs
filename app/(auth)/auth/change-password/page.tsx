import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { auth } from "@/lib/auth";
import { FormHeader } from "@/components/header";
import { ChangePasswordForm } from "@/components/forms/change-password-form";
import { sessionMustResetPassword } from "@/lib/must-reset-password";

// Forced first-login password reset screen. Reached only by a member who signed
// in with a temporary invite password (mustResetPassword=true). Everyone else
// is bounced away so this can't be used as a generic password-change page here.
export default async function ChangePasswordPage() {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
        redirect("/auth/login");
    }
    // Already reset (or a normal member who navigated here directly): send them
    // to the admin panel. Only members who MUST reset stay on this screen.
    if (!sessionMustResetPassword(session)) {
        redirect("/admin");
    }

    return (
        <div>
            <FormHeader
                icon={<KeyRound />}
                title={"Set a new password"}
                description={
                    "For your security, choose a new password before continuing. You're signed in with a temporary password."
                }
            />
            <div className={"max-w-md mt-12"}>
                <ChangePasswordForm />
            </div>
        </div>
    );
}
