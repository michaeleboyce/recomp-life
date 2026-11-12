"use client";

import { useEffect, useCallback, useState } from "react";
import { fullSync, pushUnsynced, checkConnectivity, SYNC_UNAUTHORIZED } from "@/lib/sync";
import { getSyncKey } from "@/lib/syncKey";

type SyncStatus = "idle" | "syncing" | "success" | "error" | "locked";

export function SyncProvider() {
  const [status, setStatus] = useState<SyncStatus>("idle");

  const doFullSync = useCallback(async () => {
    // No passphrase on this device yet — stay local-only without nagging.
    if (!getSyncKey()) return;

    const online = await checkConnectivity();
    if (!online) return;

    setStatus("syncing");
    const result = await fullSync();
    const rejected = result.errors.some((e) => e.includes(SYNC_UNAUTHORIZED));
    setStatus(rejected ? "locked" : result.errors.length > 0 ? "error" : "success");

    // Reset to idle after showing status briefly
    setTimeout(() => setStatus("idle"), 3000);
  }, []);

  const doPush = useCallback(async () => {
    if (!getSyncKey()) return;

    const online = await checkConnectivity();
    if (!online) return;

    try {
      await pushUnsynced();
    } catch {
      // Push failed silently — data remains unsynced and will retry next time
    }
  }, []);

  useEffect(() => {
    // Sync on mount (non-blocking)
    doFullSync();

    // Push on returning to foreground
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        doPush();
      }
    };

    // Full sync when coming back online
    const handleOnline = () => doFullSync();

    // Re-sync right after the passphrase is saved in Settings
    const handleKeyChange = () => doFullSync();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    window.addEventListener("recomp-sync-key-changed", handleKeyChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("recomp-sync-key-changed", handleKeyChange);
    };
  }, [doFullSync, doPush]);

  if (status === "idle") return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
      <div
        className={`rounded-lg px-3 py-1.5 text-xs font-medium shadow-lg ${
          status === "syncing"
            ? "bg-muted text-muted-foreground"
            : status === "success"
              ? "bg-success-soft text-success"
              : "bg-destructive-soft text-destructive"
        }`}
      >
        {status === "syncing" && "Syncing..."}
        {status === "success" && "Synced"}
        {status === "error" && "Sync failed"}
        {status === "locked" && "Sync passphrase rejected"}
      </div>
    </div>
  );
}
