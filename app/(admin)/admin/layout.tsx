import { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {AdminNavbar} from "@/components/navbar";

export default async function AdminLayout({ children }: { children: ReactNode }) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
        redirect("/auth/login")
    }
    if (session.user.role !== "admin") {
        redirect("/auth/forbidden");
    }

    return <main className={"min-h-screen"}><AdminNavbar />{children}</main>;
}