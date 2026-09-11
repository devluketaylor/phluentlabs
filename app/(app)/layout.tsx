import {Navbar} from "@/components/navbar";
import {ReactNode} from "react";
import {Footer} from "@/components/footer";
import {enforcePasswordReset} from "@/lib/must-reset-password";

const AppLayout = async ({ children }: { children: ReactNode }) => {
    // Members mid temp-password reset are gated to the change-password screen
    // and blocked from the public/app pages until they set a new password.
    await enforcePasswordReset();

    return (
        <div className={"min-h-screen flex flex-col justify-between"}>
            <div>
            <Navbar />

            <div className={"max-w-5xl mx-auto mt-14 sm:mt-16"}>

            { children }
            </div>
            </div>

            <Footer />
        </div>
    )
}

export default AppLayout;