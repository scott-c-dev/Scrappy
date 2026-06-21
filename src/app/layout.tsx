import type { Metadata, Viewport } from "next";
import "./globals.css";
import SwRegister from "./sw-register";

export const metadata: Metadata = {
  title: "Scrappy — cook what's about to go bad",
  description:
    "Say what's in your fridge. Scrappy cooks around it — no shopping trip — and puts the food that's about to go bad first in line.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Scrappy", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png", icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#5E8C3F",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        {/* Loaded by literal family name so the theme tokens
            ('Bricolage Grotesque', 'Hanken Grotesk') resolve as authored. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Hanken+Grotesk:wght@400..800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-dvh overflow-hidden">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
