import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Allow the dev server (HMR + React Refresh runtime) to be reached from
  // other devices on the LAN. Without this, Next 16 blocks cross-origin dev
  // resources, so the page renders but never hydrates (buttons do nothing).
  // Add whatever LAN IPs/hostnames you serve from here.
  allowedDevOrigins: ["10.58.9.8", "*.local"],
};

export default nextConfig;
