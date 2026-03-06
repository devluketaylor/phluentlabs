"use client"

import {Button} from "@/components/ui/button";
import {Plus, Twitter, XIcon} from "lucide-react";
import {ThemeSwitcher} from "@/components/theme-switcher";
import Link from "next/link";
import {FaTwitter} from "react-icons/fa";
import {auth} from "@/lib/auth";
import {authClient} from "@/lib/auth-client";

export const Navbar = () => {
    return (
        <nav className={"bg-navbar border-b px-3 fixed w-full bg-background/10 backdrop-blur-2xl"}>
            <div className={"flex items-center justify-between max-w-6xl mx-auto py-3"}>
            <div>
                <Link href={"/"}>
                <h1 className={"text-muted-foreground"}><span className={"bg-linear-to-tr from-primary to-red-500 text-transparent bg-clip-text font-bold"}>Phluent</span><span>Labs</span></h1>
                </Link>
            </div>

            <div className={"flex items-center gap-3"}>
                <Link href={"/"}><FaTwitter /></Link>
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
