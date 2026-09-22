import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Allow the dev server (HMR + React Refresh runtime) to be reached from
  // other devices on the LAN. Without this, Next 16 blocks cross-origin dev
  // resources, so the page renders but never hydrates (buttons do nothing).
  // Set DEV_LAN_ORIGIN in .env.local to your machine's LAN IP.
  allowedDevOrigins: [process.env.DEV_LAN_ORIGIN, "*.local"].filter(
    (o): o is string => !!o,
  ),
};

export default nextConfig;
