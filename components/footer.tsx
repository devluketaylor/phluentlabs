import Link from "next/link";
import { FaTwitter } from "react-icons/fa";
import { FooterSubscribe } from "@/components/footer-subscribe";

const navGroups: { heading: string; links: { label: string; href: string; external?: boolean }[] }[] = [
    {
        heading: "Newsletter",
        links: [
            { label: "Latest issues", href: "/issues" },
            { label: "Archive", href: "/issues" },
            { label: "Subscribe", href: "/#subscribe" },
            { label: "RSS feed", href: "/feed.xml", external: true },
        ],
    },
    {
        heading: "Resources",
        links: [
            { label: "API docs", href: "/docs/api" },
            { label: "Deliverability", href: "/docs/deliverability" },
            { label: "Embed widget", href: "/embed" },
        ],
    },
];

export const Footer = () => {
    const year = new Date().getFullYear();

    return (
        <footer className={"mt-24 border-t border-border px-4 sm:px-6"}>
            <div className={"mx-auto max-w-5xl py-12"}>
                <div className={"grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1.4fr]"}>
                    {/* Brand blurb */}
                    <div className={"space-y-3"}>
                        <Link href={"/"} className={"text-base font-semibold tracking-tight"}>
                            <span className={"text-foreground"}>Phluent</span>
                            <span className={"text-muted-foreground"}>Labs</span>
                        </Link>
                        <p className={"max-w-xs text-sm leading-relaxed text-muted-foreground"}>
                            A free Sunday newsletter for working developers — field notes from real
                            projects, with the hype filtered out.
                        </p>
                        <Link
                            href={"https://x.com/phluentlabs"}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={"PhluentLabs on X"}
                            className={
                                "inline-flex h-9 w-9 items-center justify-center border border-border text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/40"
                            }
                        >
                            <FaTwitter />
                        </Link>
                    </div>

                    {/* Nav columns */}
                    {navGroups.map((group) => (
                        <nav key={group.heading} className={"space-y-3"} aria-label={group.heading}>
                            <p className={"eyebrow text-muted-foreground"}>{group.heading}</p>
                            <ul className={"space-y-2"}>
                                {group.links.map((link) => (
                                    <li key={`${group.heading}-${link.label}`}>
                                        <Link
                                            href={link.href}
                                            {...(link.external
                                                ? { target: "_blank", rel: "noopener noreferrer" }
                                                : {})}
                                            className={
                                                "text-sm text-muted-foreground transition-colors hover:text-foreground"
                                            }
                                        >
                                            {link.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    ))}

                    {/* Compact inline subscribe */}
                    <div className={"space-y-3"}>
                        <p className={"eyebrow text-muted-foreground"}>Get the next issue</p>
                        <p className={"text-sm text-muted-foreground"}>
                            One email, every Sunday. No spam, unsubscribe anytime.
                        </p>
                        <FooterSubscribe />
                    </div>
                </div>

                <div
                    className={
                        "mt-12 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
                    }
                >
                    <p>© {year} PhluentLabs. All rights reserved.</p>
                    <p>A developer newsletter, every Sunday.</p>
                </div>
            </div>
        </footer>
    );
};
