import { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { normalizeRole } from "@/lib/roles";
import { CHANGE_PASSWORD_PATH, sessionMustResetPassword } from "@/lib/must-reset-password";

export default async function AdminLayout({ children }: { children: ReactNode }) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
        redirect("/auth/login")
    }
    // Any admin-area role (owner/admin/editor/viewer) may reach the panel.
    if (!normalizeRole(session.user.role)) {
        redirect("/auth/forbidden");
    }
    // Force a temp-password reset before any admin page renders.
    if (sessionMustResetPassword(session)) {
        redirect(CHANGE_PASSWORD_PATH);
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