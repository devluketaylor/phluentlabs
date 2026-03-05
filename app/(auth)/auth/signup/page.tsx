import {AuthSignupForm} from "@/components/forms/signup-form";
import {FormHeader} from "@/components/header";
import {UserPlus} from "lucide-react";

const AuthSignupPage = () => {
    return (
        <div>
            <FormHeader icon={<UserPlus />} title={"Create an account"} description={"Fill out details below to signup."} />

            <div className={"max-w-md mt-12"}>
            <AuthSignupForm />
            </div>
        </div>
    )
}

export default AuthSignupPage;