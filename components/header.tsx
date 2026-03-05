import {cloneElement, JSX } from "react";

export const FormHeader = ({ icon, title, description }: { icon: JSX.Element, title: string, description: string }) => {
    const clonedIcon = cloneElement(icon, { className: "drop-shadow-lg drop-shadow-blue-500/70 text-primary" });
    return (
        <header className={"flex items-center gap-4"}>
       <div className={"bg-linear-to-tr from-primary/20 to-blue-500/20 rounded-xl p-3 flex items-center justify-center"}>
                { clonedIcon }
            </div>

            <div className={"flex flex-col"}>
                <p className={"font-semibold"}>{ title }</p>
                <p className={"text-muted-foreground text-sm"}>{ description }</p>
            </div>
        </header>
    )
}