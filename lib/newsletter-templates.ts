// Insertable starter content blocks for the newsletter rich editor.
//
// Each template returns an HTML string that is inserted into the tiptap
// editor at the current cursor position (via `editor.commands.insertContent`).
// Keep the markup to tags tiptap's StarterKit + Link/Image extensions understand
// (h1/h2/h3, p, strong/em, ul/ol/li, a, blockquote, hr) so it round-trips cleanly.
//
// These are neutral scaffolds (placeholder copy the writer replaces), not final
// content. Coral accent (#ff5c5c) is intentionally NOT hard-coded here — the
// rendered newsletter/theme owns color; inline styling belongs to the send layer,
// not editor body HTML.

export type NewsletterTemplate = {
    id: string;
    label: string;
    description: string;
    /** HTML inserted at the cursor. */
    html: string;
};

export const newsletterTemplates: NewsletterTemplate[] = [
    {
        id: "issue-intro",
        label: "Issue intro",
        description: "Greeting + short lede to open an issue.",
        html: [
            "<h1>Issue title goes here</h1>",
            "<p>Hey friends,</p>",
            "<p>Welcome back to another issue. Here's a quick line on what's inside and why it matters this week.</p>",
        ].join(""),
    },
    {
        id: "section-heading",
        label: "Section heading",
        description: "A titled section with a lead paragraph.",
        html: [
            "<h2>Section title</h2>",
            "<p>Set up the section in a sentence or two so readers know what's coming.</p>",
        ].join(""),
    },
    {
        id: "bulleted-list",
        label: "Bulleted list",
        description: "Three-item bulleted rundown.",
        html: [
            "<h2>The rundown</h2>",
            "<ul>",
            "<li><strong>First thing</strong> — a short note about it.</li>",
            "<li><strong>Second thing</strong> — a short note about it.</li>",
            "<li><strong>Third thing</strong> — a short note about it.</li>",
            "</ul>",
        ].join(""),
    },
    {
        id: "featured-link",
        label: "Featured link",
        description: "A highlighted link with a why-read-it line.",
        html: [
            "<h3>Worth a read</h3>",
            '<p><a href="https://example.com">Link title goes here</a><br>Why it caught our eye and what you\'ll get from it.</p>',
        ].join(""),
    },
    {
        id: "quote",
        label: "Quote / callout",
        description: "A pull-quote or callout blockquote.",
        html: [
            "<blockquote><p>Drop a memorable line or quote here.</p></blockquote>",
            "<p>— Attribution or a one-line follow-up.</p>",
        ].join(""),
    },
    {
        id: "cta",
        label: "Call to action",
        description: "A prompt nudging readers to act.",
        html: [
            "<hr>",
            "<h3>Before you go</h3>",
            '<p>Enjoying PhluentLabs? <a href="https://example.com">Share it with a friend</a> or reply and tell us what you\'d like to see next.</p>',
        ].join(""),
    },
    {
        id: "signoff",
        label: "Sign-off",
        description: "A warm closing line.",
        html: [
            "<hr>",
            "<p>That's all for this issue — thanks for reading.</p>",
            "<p>Until next time,<br><strong>The PhluentLabs team</strong></p>",
        ].join(""),
    },
];
