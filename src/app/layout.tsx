import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scrappy — cook what's about to go bad",
  description:
    "Say what's in your fridge. Scrappy cooks around it — no shopping trip — and puts the food that's about to go bad first in line.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        {/* Loaded by literal family name so the theme tokens (e.g.
            'Bricolage Grotesque') resolve as authored across all 4 directions. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Hanken+Grotesk:wght@400..800&family=Instrument+Serif:ital@0;1&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-dvh overflow-hidden">{children}</body>
    </html>
  );
}
