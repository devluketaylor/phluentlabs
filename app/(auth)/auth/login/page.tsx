import {AuthLoginForm} from "@/components/forms/login-form";
import {FormHeader} from "@/components/header";
import {LogIn} from "lucide-react";

const AuthLoginPage = () => {
    return (
        <div>
            <FormHeader icon={<LogIn />} title={"Login to your account"} description={"Fill out details below to login."} />

            <div className={"max-w-md mt-12"}>
             <AuthLoginForm />
            </div>
        </div>
    )
}

export default AuthLoginPage;