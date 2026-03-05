"use client";

import {useEffect, useState} from "react";
import {useTheme} from "next-themes";
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import {Check, Laptop, Moon, Sun} from "lucide-react";
import {Button} from "@/components/ui/button";

export const ThemeSwitcher = () => {
    const [mounted, setMounted] = useState(false);
    const { theme, setTheme } = useTheme();

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    const current = theme ?? "system";

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant={"outline"} size={"icon"} aria-label={"Toggle theme"}>
                { current === "light" ? (
                    <Sun className={"h-4 w-4"} />
                ): current === "dark" ? (
                    <Moon className={"h-4 w-4"} />
                ) : (
                    <Laptop className={"h-4 w-4"} />
                )}
            </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme("light")}>
                    <Sun className="mr-2 h-4 w-4" />
                    Light
                    {current === "light" ? <Check className="ml-auto h-4 w-4" /> : null}
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => setTheme("dark")}>
                    <Moon className="mr-2 h-4 w-4" />
                    Dark
                    {current === "dark" ? <Check className="ml-auto h-4 w-4" /> : null}
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => setTheme("system")}>
                    <Laptop className="mr-2 h-4 w-4" />
                    System
                    {current === "system" ? <Check className="ml-auto h-4 w-4" /> : null}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}