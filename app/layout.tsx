import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import {ThemeProvider} from "next-themes";
import {Providers} from "@/app/providers";
import {Toaster} from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://phluentlabs.com";

export const metadata: Metadata = {
  title: {
    default: "PhluentLabs",
    template: "%s | PhluentLabs",
  },
  description:
    "What I'm noticing while building the web — straight to your inbox. A weekly newsletter for developers.",
  metadataBase: new URL(APP_URL),
  openGraph: {
    siteName: "PhluentLabs",
    title: "PhluentLabs",
    description:
      "What I'm noticing while building the web — straight to your inbox. A weekly newsletter for developers.",
    url: APP_URL,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "PhluentLabs",
    description:
      "What I'm noticing while building the web — straight to your inbox. A weekly newsletter for developers.",
    creator: "@luketaylordev",
  },
  alternates: {
    canonical: APP_URL,
    types: {
      "application/rss+xml": `${APP_URL}/feed.xml`,
    },
  },
};

// Site-wide structured data. WebSite + Organization describe the brand and site
// as a whole (distinct from per-page Article/Collection JSON-LD). A SearchAction
// is intentionally omitted — there is no site-wide GET search endpoint (archive
// search is client-side only), so advertising one would be inaccurate.
const siteJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${APP_URL}/#website`,
      url: APP_URL,
      name: "PhluentLabs",
      description:
        "What I'm noticing while building the web — a weekly newsletter for developers.",
      inLanguage: "en",
      publisher: { "@id": `${APP_URL}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${APP_URL}/#organization`,
      name: "PhluentLabs",
      url: APP_URL,
      description:
        "A weekly developer newsletter on building the modern web, by Luke Taylor.",
      founder: {
        "@type": "Person",
        name: "Luke Taylor",
        url: "https://x.com/luketaylordev",
      },
      sameAs: ["https://x.com/luketaylordev", "https://x.com/phluentlabs"],
    },
    {
      "@type": "Blog",
      "@id": `${APP_URL}/#blog`,
      url: APP_URL,
      name: "PhluentLabs",
      description:
        "Notes on building the web, for developers — published weekly.",
      publisher: { "@id": `${APP_URL}/#organization` },
      inLanguage: "en",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
      />
      <ThemeProvider attribute={"class"} disableTransitionOnChange={true} defaultTheme={"system"}>
          <Providers>
              {children}
              <Toaster />
          </Providers>
      </ThemeProvider>
      </body>
    </html>
  );
}
