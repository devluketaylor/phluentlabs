"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Copy } from "lucide-react";

/**
 * Interactive builder for the copy-paste embed snippet. Lets the host tweak a
 * few options (collect name, referral code) and copy an <iframe> tag pointing
 * at /embed/subscribe. Uses window.location.origin so the generated URL is
 * correct in both dev and prod.
 */
export function EmbedSnippet() {
    const [origin, setOrigin] = React.useState("https://phluentlabs.com");
    const [collectName, setCollectName] = React.useState(false);
    const [ref, setRef] = React.useState("");
    const [copied, setCopied] = React.useState(false);

    React.useEffect(() => {
        if (typeof window !== "undefined") setOrigin(window.location.origin);
    }, []);

    const src = React.useMemo(() => {
        const url = new URL("/embed/subscribe", origin);
        if (collectName) url.searchParams.set("name", "1");
        if (ref.trim()) url.searchParams.set("ref", ref.trim());
        return url.toString();
    }, [origin, collectName, ref]);

    const snippet = `<iframe
  src="${src}"
  title="Subscribe to PhluentLabs"
  width="100%"
  height="${collectName ? 320 : 260}"
  style="border:0;max-width:480px;"
  loading="lazy"
></iframe>`;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(snippet);
            setCopied(true);
            toast.success("Snippet copied to clipboard");
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Couldn't copy — select and copy manually.");
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={collectName}
                        onChange={(e) => setCollectName(e.target.checked)}
                        className="size-4 accent-[#ff5c5c]"
                    />
                    Also collect a first name
                </label>
                <div className="space-y-1">
                    <label className="text-muted-foreground text-xs" htmlFor="ref">
                        Referral code (optional)
                    </label>
                    <Input
                        id="ref"
                        placeholder="e.g. 8CTE6G4D"
                        value={ref}
                        onChange={(e) => setRef(e.target.value)}
                    />
                </div>
            </div>

            <div className="relative">
                <pre className="bg-muted overflow-x-auto rounded-xl p-4 text-xs leading-relaxed">
                    <code>{snippet}</code>
                </pre>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={copy}
                    className="absolute right-2 top-2"
                >
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied ? "Copied" : "Copy"}
                </Button>
            </div>

            <div>
                <h3 className="mb-3 text-sm font-semibold">Live preview</h3>
                <div className="bg-muted/40 rounded-xl border p-4">
                    <iframe
                        src={src}
                        title="Subscribe preview"
                        width="100%"
                        height={collectName ? 320 : 260}
                        style={{ border: 0, maxWidth: 480 }}
                    />
                </div>
            </div>
        </div>
    );
}
