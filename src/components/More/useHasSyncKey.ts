"use client";

import { useSyncExternalStore } from "react";
import { getSyncKey } from "@/lib/syncKey";

// Settings' sync card fires this after saving or clearing the passphrase.
const CHANGED_EVENT = "recomp-sync-key-changed";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED_EVENT, onChange);
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
