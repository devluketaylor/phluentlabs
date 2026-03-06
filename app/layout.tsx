import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import {ThemeProvider} from "next-themes";
import {Providers} from "@/app/providers";

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
  },
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
      <ThemeProvider attribute={"class"} disableTransitionOnChange={true} defaultTheme={"system"}>
          <Providers>
              {children}
          </Providers>
      </ThemeProvider>
      </body>
    </html>
  );
}
