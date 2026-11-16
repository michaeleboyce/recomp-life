import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { syncApiHeaders } from "./src/lib/apiBase";
import { securityHeaders } from "./src/lib/securityHeaders";

// BUILD_TARGET=native produces the static files bundled into the iPhone app
// (see scripts/build-native.mjs). Without it this is the normal web build.
const native = process.env.BUILD_TARGET === "native";

export default function nextConfig(phase: string): NextConfig {
  if (native) {
    // A static export has no server, so it sends no headers.
    return {
      output: "export",
      // /history is written as history/index.html, which the app's local file
      // server can find without rewrite rules.
      trailingSlash: true,
      images: { unoptimized: true },
    };
  }

  const pageHeaders = securityHeaders({
    dev: phase === PHASE_DEVELOPMENT_SERVER,
    apiBase: process.env.NEXT_PUBLIC_API_BASE,
  });
  return {
    async headers() {
      return [
        // Every page and file: CSP, referrer, MIME sniffing, browser features.
        { source: "/:path*", headers: pageHeaders },
        // The iPhone app calls the sync API from its own origin; nothing under it is cached.
        { source: "/api/sync/:path*", headers: syncApiHeaders() },
      ];
    },
  };
}
