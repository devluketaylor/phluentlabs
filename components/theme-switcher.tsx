"use client";

import {useEffect, useState} from "react";
import {useTheme} from "next-themes";
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import {Check, Moon, Sun} from "lucide-react";
import {Button} from "@/components/ui/button";

export const ThemeSwitcher = () => {
    const [mounted, setMounted] = useState(false);
    const { theme, setTheme } = useTheme();

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    // Dark is the primary/default look (enableSystem is off), so light is the
    // only opt-in. Default the trigger icon to Moon when the theme isn't light.
    const current = theme ?? "dark";

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant={"outline"} size={"icon"} aria-label={"Toggle theme"}>
                { current === "light" ? (
                    <Sun className={"h-4 w-4"} />
                ) : (
                    <Moon className={"h-4 w-4"} />
                )}
            </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme("dark")}>
                    <Moon className="mr-2 h-4 w-4" />
                    Dark
                    {current === "dark" ? <Check className="ml-auto h-4 w-4" /> : null}
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => setTheme("light")}>
                    <Sun className="mr-2 h-4 w-4" />
                    Light
                    {current === "light" ? <Check className="ml-auto h-4 w-4" /> : null}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}