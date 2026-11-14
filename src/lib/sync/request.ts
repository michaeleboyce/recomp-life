// The one place the sync client talks HTTP. Route every sync request through a
// different server by changing SYNC_BASE_URL (empty: same origin).
import { syncAuthHeaders } from "@/lib/syncKey";

export const SYNC_BASE_URL = "";

/** fetch() for a sync API path (for example "/api/sync/pull"), with the passphrase header. */
export function syncRequest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SYNC_BASE_URL}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...syncAuthHeaders() },
  });
}
