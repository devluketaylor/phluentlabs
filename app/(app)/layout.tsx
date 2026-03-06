import {Navbar} from "@/components/navbar";
import {ReactNode} from "react";
import {Footer} from "@/components/footer";

const AppLayout = ({ children }: { children: ReactNode }) => {
    return (
        <div className={"min-h-screen flex flex-col justify-between"}>
            <div>
            <Navbar />

            <div className={"max-w-5xl mx-auto mt-16"}>

            { children }
            </div>
            </div>

            <Footer />
        </div>
    )
}

export default AppLayout;