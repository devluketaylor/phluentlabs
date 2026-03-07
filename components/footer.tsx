import Link from "next/link";
import {FaTwitter} from "react-icons/fa";

export const Footer = () => {
    return (
        <footer className={"border-t border-border py-3 px-3"}>
            <div className={"max-w-6xl mx-auto flex items-center justify-between"}>
            <div>
                <Link href={""}><span className={"bg-linear-to-tr from-primary to-red-500 bg-clip-text text-transparent"}>Phluent</span>Labs</Link>
                <p className={"text-muted-foreground text-sm"}>A developers newsletter.</p>
            </div>

            <div>
                <Link href={""} target="_blank" rel="noopener noreferrer">
                    <FaTwitter />
                </Link>
            </div>
            </div>
        </footer>
    )
}