import type { NextConfig } from "next";
import { nativeAppCorsHeaders } from "./src/lib/apiBase";

// BUILD_TARGET=native produces the static files bundled into the iPhone app
// (see scripts/build-native.mjs). Without it this is the normal web build.
const native = process.env.BUILD_TARGET === "native";

const nextConfig: NextConfig = native
  ? {
      output: "export",
      // /history is written as history/index.html, which the app's local file
      // server can find without rewrite rules.
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {
      // The iPhone app calls the sync API from its own origin.
      async headers() {
        return [{ source: "/api/sync/:path*", headers: nativeAppCorsHeaders() }];
      },
    };

export default nextConfig;
