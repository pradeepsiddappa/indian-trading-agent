import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Public client configuration is frozen into the browser bundle at build
  // time by Next.js. Keeping this explicit also works with Turbopack, which
  // otherwise leaves dynamic process.env access unresolved in client chunks.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "",
  },
};

export default nextConfig;
