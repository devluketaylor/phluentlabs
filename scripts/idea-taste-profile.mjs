// Read Luke's Idea Lab taste profile (his Good/Bad verdicts) so a future
// idea-engine run can bias toward what he likes. Reads DATABASE_URL from the
// environment (or falls back to the local dev DB). Prints a compact JSON
// summary to stdout — no secrets, just titles/scores/sources + verdict.
//
// Usage:  node scripts/idea-taste-profile.mjs
import postgres from "postgres";

const url =
    process.env.DATABASE_URL ||
    "postgres://dev:dev@localhost:5433/phluent";
const disableSsl = /sslmode=disable/.test(url) || url.includes("localhost");
const sql = postgres(url, { ssl: disableSsl ? false : "require" });

try {
    const rated = await sql`
        select title, verdict, score, source
        from ideas
        where verdict is not null
        order by verdict_at desc
    `;
    const liked = rated.filter((r) => r.verdict === "good");
    const disliked = rated.filter((r) => r.verdict === "bad");
    console.log(
        JSON.stringify(
            {
                ratedCount: rated.length,
                liked: liked.map((r) => ({ title: r.title, score: r.score, source: r.source })),
                disliked: disliked.map((r) => ({ title: r.title, score: r.score, source: r.source })),
            },
            null,
            2,
        ),
    );
} finally {
    await sql.end();
}
