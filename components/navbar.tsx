import {Button} from "@/components/ui/button";
import {Plus, Twitter, XIcon} from "lucide-react";
import {ThemeSwitcher} from "@/components/theme-switcher";
import Link from "next/link";
import {FaTwitter} from "react-icons/fa";

export const Navbar = () => {
    return (
        <nav className={"bg-navbar border-b py-4 px-4 flex items-center justify-between"}>
            <div>
                <Link href={"/"}>
                <h1 className={"text-muted-foreground"}>{"{ "}<span className={"bg-linear-to-tr from-primary to-blue-500 text-transparent bg-clip-text font-bold"}>Phluent</span><span>Labs</span>{" }"}</h1>
                </Link>
            </div>

            <div className={"flex items-center gap-3"}>
                <Link href={"/"}><FaTwitter /></Link>
                <ThemeSwitcher />
            </div>
        </nav>
    )
}
