"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MailPlus, Newspaper, Users, LogOut } from "lucide-react";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";

const navItems = [
    { title: "Create Newsletter", href: "/admin", icon: MailPlus },
    { title: "Newsletters", href: "/admin/newsletters", icon: Newspaper },
    { title: "Subscribers", href: "/admin/subscribers", icon: Users },
];

export function AdminSidebar() {
    const pathname = usePathname();

    return (
        <Sidebar variant={"sidebar"} className={"bg-sidebar pt-43"}>
            <SidebarHeader className="p-4">
                <p className="font-bold text-lg">
                    <span className="bg-linear-to-tr from-primary to-red-500 text-transparent bg-clip-text">Phluent</span>
                    <span>Labs</span>
                </p>
                <p className="text-xs text-muted-foreground">Admin Panel</p>
            </SidebarHeader>

            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Newsletter</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {navItems.map((item) => (
                                <SidebarMenuItem key={item.href}>
                                    <SidebarMenuButton asChild isActive={pathname === item.href}>
                                        <Link href={item.href}>
                                            <item.icon />
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="p-2">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => authClient.signOut()}>
                            <LogOut />
                            <span>Logout</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
}
