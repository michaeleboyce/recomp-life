// Security headers for every page of the web build, applied by next.config.ts
// `headers()`. The iPhone app's static export ignores them (it is served from inside
// the app). Imported by next.config.ts: keep this file free of "@/" imports.

export interface SecurityHeaderOptions {
  /** `next dev`: React's dev tooling needs eval. */
  dev?: boolean;
  /** NEXT_PUBLIC_API_BASE, when the sync API is on another origin. */
  apiBase?: string;
}

/** The origin of `url` ("https://host"), or undefined when it is empty or not a URL. */
function originOf(url: string | undefined): string | undefined {
  if (!url || !url.trim()) return undefined;
  try {
    return new URL(url.trim()).origin;
  } catch {
    return undefined;
  }
}

/** The Content-Security-Policy value. */
export function contentSecurityPolicy({ dev = false, apiBase }: SecurityHeaderOptions = {}): string {
  const apiOrigin = originOf(apiBase);
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    // Next.js puts each page's data in inline <script> tags. Allowing them without
    // 'unsafe-inline' takes a per-request nonce, which makes every page dynamic and
    // cannot work in the static pages the service worker and the iPhone app keep.
    // 'wasm-unsafe-eval' lets the 3D model's Draco decoder (public/draco) compile
    // its WebAssembly; it does not allow eval of JavaScript.
    ["script-src", ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(dev ? ["'unsafe-eval'"] : [])]],
    // Sheets and dialogs (Radix) add <style> elements while they are open.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    // Images made in the page: data: URIs, and blob: URLs, which three.js uses for
    // textures embedded in a model.
    ["img-src", ["'self'", "data:", "blob:"]],
    ["font-src", ["'self'"]],
    ["connect-src", ["'self'", ...(apiOrigin ? [apiOrigin] : [])]],
    // The service worker and the rest timer are files of this site; three.js runs
    // the Draco decoder in a worker built from a blob: URL.
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

/** Browser features the app never uses, switched off for the page and anything it embeds. */
export const DENIED_FEATURES = [
  "accelerometer",
  "bluetooth",
  "browsing-topics",
  "camera",
  "display-capture",
  "geolocation",
  "gyroscope",
  "hid",
  "magnetometer",
  "microphone",
  "midi",
  "payment",
  "serial",
  "usb",
] as const;

/** Headers for every page: CSP, referrer, MIME sniffing and browser features. */
export function securityHeaders(options: SecurityHeaderOptions = {}): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Permissions-Policy", value: DENIED_FEATURES.map((feature) => `${feature}=()`).join(", ") },
  ];
}
