import Link from "next/link";
import {FaTwitter} from "react-icons/fa";

export const Footer = () => {
    return (
        <footer className={"border-t border-border py-3 px-3"}>
            <div className={"max-w-6xl mx-auto flex items-start justify-between"}>
            <div>
                <Link href={""}><span className={"bg-linear-to-tr from-primary to-red-500 bg-clip-text text-transparent"}>Phluent</span>Labs</Link>
                <p className={"text-muted-foreground text-sm"}>A developers newsletter.</p>

                <div className={"flex items-center gap-2 text-sm mt-6"}>
                    <Link href={"/legal/termsofservice"}>
                        Terms of service
                    </Link>

                    <div className={"w-1 h-1 rounded-full bg-muted-foreground dark:bg-muted"} />
                    <Link href={"/legal/privacypolicy"}>
                        Privacy policy
                    </Link>
                </div>
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