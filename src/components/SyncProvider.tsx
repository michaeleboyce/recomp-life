"use client";

import { useEffect, useCallback, useState } from "react";
import { fullSync, pushUnsynced, checkConnectivity } from "@/lib/sync";

type SyncStatus = "idle" | "syncing" | "success" | "error";

export function SyncProvider() {
  const [status, setStatus] = useState<SyncStatus>("idle");

  const doFullSync = useCallback(async () => {
    const online = await checkConnectivity();
    if (!online) return;

    setStatus("syncing");
    const result = await fullSync();
    setStatus(result.errors.length > 0 ? "error" : "success");

    // Reset to idle after showing status briefly
    setTimeout(() => setStatus("idle"), 3000);
  }, []);

  const doPush = useCallback(async () => {
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

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [doFullSync, doPush]);

  if (status === "idle") return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
      <div
        className={`rounded-lg px-3 py-1.5 text-xs font-medium shadow-lg ${
          status === "syncing"
            ? "bg-zinc-800 text-zinc-300"
            : status === "success"
              ? "bg-emerald-900/80 text-emerald-300"
              : "bg-red-900/80 text-red-300"
        }`}
      >
        {status === "syncing" && "Syncing..."}
        {status === "success" && "Synced"}
        {status === "error" && "Sync failed"}
      </div>
    </div>
  );
}
