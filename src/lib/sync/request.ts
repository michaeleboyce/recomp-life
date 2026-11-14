// The one place the sync client talks HTTP. Route every sync request through a
// different server by changing SYNC_BASE_URL (empty: same origin).
import { apiUrl } from "@/lib/apiBase";
import { syncAuthHeaders } from "@/lib/syncKey";

/**
 * Where the sync API lives. Empty on the web (same origin); the iPhone app, which
 * has no server of its own, is built with the web deployment's address.
 */
export const SYNC_BASE_URL = apiUrl("/").replace(/\/$/, "");

/** fetch() for a sync API path (for example "/api/sync/pull"), with the passphrase header. */
export function syncRequest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SYNC_BASE_URL}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...syncAuthHeaders() },
  });
}
