import type { MetadataRoute } from "next";

/* PWA manifest (PRD §5 — "Add to Home Screen" capable, mobile portrait). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Scrappy — cook what's about to go bad",
    short_name: "Scrappy",
    description:
      "Say what's in your fridge. Scrappy cooks around it — no shopping trip — and puts the food that's about to go bad first in line.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F2F3E4",
    theme_color: "#5E8C3F",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/icon-192.png", type: "image/png", sizes: "192x192", purpose: "any" },
      {
        src: "/icon-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "maskable",
      },
    ],
  };
}
