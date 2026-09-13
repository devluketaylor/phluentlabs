import type { MetadataRoute } from "next";

// Basic PWA manifest. Icons are intentionally omitted: /public currently holds
// only .svg assets (no maskable/any PNG icons), and referencing missing icons
// would 404. Add an `icons` array here once real PNG icons exist in /public.
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "PhluentLabs",
        short_name: "PhluentLabs",
        description:
            "What I'm noticing while building the web — a weekly newsletter for developers.",
        start_url: "/",
        display: "standalone",
        // Dark is the primary/default look — the manifest chrome color matches
        // the near-black futuristic background (retired the old coral).
        background_color: "#0a0a0a",
        theme_color: "#0a0a0a",
    };
}
