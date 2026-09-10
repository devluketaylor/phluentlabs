import { ImageResponse } from "next/og";
import { db } from "@/db/client";
import { newsletters } from "@/db/schemas/newsletters";
import { and, eq, or } from "drizzle-orm";

export const runtime = "nodejs";
export const alt = "PhluentLabs newsletter issue";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = { params: Promise<{ slug: string }> };

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
    const { slug } = await params;
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
                {/* Small kicker label — keeps a light brand cue without competing
                    with the title. The issue TITLE is the star of the card. */}
                <div
                    style={{
                        display: "flex",
                        color: "#ff5c5c",
                        fontSize: 22,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "3px",
                    }}
                >
                    phluent weekly
                </div>

                <div
                    style={{
                        display: "flex",
                        color: "#ffffff",
                        fontSize: 68,
                        fontWeight: 700,
                        lineHeight: 1.12,
                        letterSpacing: "-1.5px",
                        maxWidth: "1060px",
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
