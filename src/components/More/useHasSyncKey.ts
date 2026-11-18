"use client";

import { useSyncExternalStore } from "react";
import { getSyncKey, SYNC_KEY_CHANGED_EVENT } from "@/lib/syncKey";

function subscribe(onChange: () => void) {
  window.addEventListener(SYNC_KEY_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SYNC_KEY_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** True when a sync passphrase is saved on this device. False on the server. */
export function useHasSyncKey(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getSyncKey() !== null,
    () => false
  );
}
