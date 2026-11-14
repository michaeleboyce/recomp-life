// Where the app's API lives. On the web the API is on the same origin, so paths
// are used as they are. The iPhone app is served from inside the app bundle and
// has no API of its own; its build sets NEXT_PUBLIC_API_BASE to the web
// deployment's address.

/** The address to fetch for an API path such as "/api/sync/push". */
export function apiUrl(path: string, base: string | undefined = process.env.NEXT_PUBLIC_API_BASE): string {
  const trimmed = (base ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return path;
  return `${trimmed}/${path.replace(/^\/+/, "")}`;
}

/** The origin the iPhone app's pages are served from, inside the app. */
export const NATIVE_APP_ORIGIN = "capacitor://localhost";

/**
 * Response headers that let the iPhone app, and only it, call the sync API from
 * its own origin with the sync passphrase. Browsers on any other origin are
 * still refused; the passphrase is still required on every request.
 */
export function nativeAppCorsHeaders(): { key: string; value: string }[] {
  return [
    { key: "Access-Control-Allow-Origin", value: NATIVE_APP_ORIGIN },
    { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
    { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type" },
    { key: "Access-Control-Max-Age", value: "86400" },
    { key: "Vary", value: "Origin" },
  ];
}
