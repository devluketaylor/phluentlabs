import {Navbar} from "@/components/navbar";
import {ReactNode} from "react";

const AppLayout = ({ children }: { children: ReactNode }) => {
    return (
        <div>
            <Navbar />

            <div className={"max-w-5xl mx-auto flex justify-center w-full min-h-[90vh]"}>
            { children }
            </div>
        </div>
    )
}

export default AppLayout;