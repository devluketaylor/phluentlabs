import Link from "next/link";
import {FaTwitter} from "react-icons/fa";

export const Footer = () => {
    return (
        <footer className={"border-t border-border py-3"}>
            <div className={"max-w-5xl mx-auto flex items-center justify-between"}>
            <div>
                <Link href={""}><span className={"bg-linear-to-tr from-primary to-red-500 bg-clip-text text-transparent"}>Phluent</span>Labs</Link>
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