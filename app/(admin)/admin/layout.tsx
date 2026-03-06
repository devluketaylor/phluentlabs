import { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default async function AdminLayout({ children }: { children: ReactNode }) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
        redirect("/auth/login")
    }
    if (session.user.role !== "admin") {
        redirect("/auth/forbidden");
    }

    return (
        <SidebarProvider>
            <AdminSidebar />
            <main className="flex-1 min-h-screen">
                <div className="border-b px-4 py-3">
                    <SidebarTrigger />
                </div>
                {children}
            </main>
        </SidebarProvider>
    );
}