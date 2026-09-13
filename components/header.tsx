import {cloneElement, JSX } from "react";

export const FormHeader = ({ icon, title, description }: { icon: JSX.Element, title: string, description: string }) => {
    const clonedIcon = cloneElement(icon, { className: "text-foreground" });
    return (
        <header className={"flex items-center gap-4"}>
       <div className={"border border-border bg-muted p-3 flex items-center justify-center"}>
                { clonedIcon }
            </div>

            <div className={"flex flex-col"}>
                <p className={"font-semibold"}>{ title }</p>
                <p className={"text-muted-foreground text-sm"}>{ description }</p>
            </div>
        </header>
    )
}