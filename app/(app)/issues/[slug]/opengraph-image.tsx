import { ImageResponse } from "next/og";
import { db } from "@/db/client";
import { newsletters } from "@/db/schemas/newsletters";
import { and, eq, or } from "drizzle-orm";

export const runtime = "nodejs";
export const alt = "PhluentLabs newsletter issue";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = { params: { slug: string } };

async function getIssue(slug: string) {
    try {
        const [issue] = await db
            .select({
                subject: newsletters.subject,
                preheader: newsletters.preheader,
                sentAt: newsletters.sentAt,
                createdAt: newsletters.createdAt,
            })
            .from(newsletters)
            .where(
                and(
                    or(eq(newsletters.slug, slug), eq(newsletters.id, slug)),
                    eq(newsletters.status, "sent"),
                ),
            );
        return issue ?? null;
    } catch {
        return null;
    }
}

export default async function Image({ params }: Props) {
    const { slug } = params;
    const issue = await getIssue(slug);

    const subject = issue?.subject ?? "PhluentLabs";
    const date = issue
        ? new Date(issue.sentAt ?? issue.createdAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
          })
        : "";

    return new ImageResponse(
        (
            <div
                style={{
                    height: "100%",
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    background: "linear-gradient(135deg, #0a0a0a 0%, #1a0e0e 60%, #2a1010 100%)",
                    padding: "70px",
                    fontFamily: "sans-serif",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                        style={{
                            color: "#ff5c5c",
                            fontSize: 30,
                            fontWeight: 700,
                            letterSpacing: "-0.5px",
                        }}
                    >
                        Phluent
                    </div>
                    <div style={{ color: "#ffffff", fontSize: 30, fontWeight: 700 }}>Labs</div>
                    <div
                        style={{
                            color: "#888",
                            fontSize: 20,
                            marginLeft: "10px",
                            textTransform: "uppercase",
                            letterSpacing: "2px",
                        }}
                    >
                        weekly · for developers
                    </div>
                </div>

                <div
                    style={{
                        display: "flex",
                        color: "#ffffff",
                        fontSize: 64,
                        fontWeight: 700,
                        lineHeight: 1.15,
                        letterSpacing: "-1.5px",
                        maxWidth: "1000px",
                    }}
                >
                    {subject}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ color: "#999", fontSize: 26 }}>{date}</div>
                    <div style={{ color: "#666", fontSize: 24 }}>phluentlabs.com</div>
                </div>
            </div>
        ),
        { ...size },
    );
}
