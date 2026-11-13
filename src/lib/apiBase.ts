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
