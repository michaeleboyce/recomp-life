// The sync passphrase is kept on this device only (localStorage) and sent with
// every sync request. It must match SYNC_SECRET on the server.
const STORAGE_KEY = 'recomp-sync-key';

/** Dispatched on window after the passphrase is saved or removed on this device. */
export const SYNC_KEY_CHANGED_EVENT = 'recomp-sync-key-changed';

export function getSyncKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setSyncKey(value: string): void {
  const trimmed = value.trim();
  try {
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage unavailable (private mode) — sync stays locked on this device.
  }
}

export function syncAuthHeaders(): Record<string, string> {
  const key = getSyncKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}
