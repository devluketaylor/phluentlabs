"use client"

import {Button} from "@/components/ui/button";
import {ThemeSwitcher} from "@/components/theme-switcher";
import Link from "next/link";
import {FaTwitter} from "react-icons/fa";
import {authClient} from "@/lib/auth-client";

export const Navbar = () => {
    return (
        <nav className={"fixed w-full border-b border-border bg-background/70 px-3 backdrop-blur-xl"}>
            <div className={"flex items-center justify-between max-w-6xl mx-auto py-3"}>
            <div>
                <Link href={"/"} className={"group"}>
                <span className={"text-base font-semibold tracking-tight"}>
                    <span className={"text-foreground"}>Phluent</span><span className={"text-muted-foreground"}>Labs</span>
                </span>
                </Link>
            </div>

            <div className={"flex items-center gap-2"}>
                <Link
                    href={"https://x.com/phluentlabs"}
                    target={"_blank"}
                    rel={"noopener noreferrer"}
                    aria-label={"PhluentLabs on X"}
                    className={"text-muted-foreground transition-colors hover:text-foreground"}
                >
                    <FaTwitter />
                </Link>
                <ThemeSwitcher />
            </div>
            </div>
        </nav>
    )
}

export const AdminNavbar = () => {
    const onSubmit = () => {
        authClient.signOut();
    }

    return (
        <nav className={"bg-navbar border-b py-4 px-4 flex items-center justify-between"}>
            <p className={"font-bold"}>PL Admin</p>
            <Button onClick={onSubmit}>Logout</Button>
        </nav>
    )
}
