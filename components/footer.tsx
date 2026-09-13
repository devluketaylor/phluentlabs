import Link from "next/link";
import {FaTwitter} from "react-icons/fa";

export const Footer = () => {
    return (
        <footer className={"border-t border-border py-6 px-3"}>
            <div className={"max-w-6xl mx-auto flex items-center justify-between"}>
            <div className={"space-y-0.5"}>
                <Link href={"/"} className={"text-sm font-semibold tracking-tight"}>
                    <span className={"text-foreground"}>Phluent</span><span className={"text-muted-foreground"}>Labs</span>
                </Link>
                <p className={"text-muted-foreground text-xs"}>A developer newsletter, every Sunday.</p>
            </div>

            <div>
                <Link
                    href={"https://x.com/phluentlabs"}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={"PhluentLabs on X"}
                    className={"text-muted-foreground transition-colors hover:text-foreground"}
                >
                    <FaTwitter />
                </Link>
            </div>
            </div>
        </footer>
    )
}