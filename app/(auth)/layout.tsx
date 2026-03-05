import {ReactNode} from "react";
import {AdminNavbar} from "@/components/navbar";

const AuthLayout = ({ children }: { children: ReactNode }) => {
    return (
        <div className={"min-h-screen"}>
            <AdminNavbar />
            <div className={"max-w-md pt-12 mx-auto"}>
            {children}
            </div>
        </div>
    )
}

export default AuthLayout;