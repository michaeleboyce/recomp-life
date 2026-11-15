import type { CapacitorConfig } from "@capacitor/cli";

// The iPhone shell around the web app. The web files come from
// `npm run build:native`, which writes them to ./out.
const config: CapacitorConfig = {
  appId: "com.recomplife.app",
  appName: "ReComp Life",
  webDir: "out",
};

export default config;
