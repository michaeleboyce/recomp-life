"use client";

import { useEffect, useState } from "react";
import { requestNotificationPermission } from "@/lib/audio";

/** Keeps the screen on while the workout screen is mounted. */
export function useWakeLock(): void {
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;

    async function requestWakeLock() {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch {
        // Not supported or denied: the workout still works.
      }
    }

    requestWakeLock();

    // The lock is released when the page is hidden; take it again on return.
    const handleVisibility = () => {
      if (document.visibilityState === "visible") requestWakeLock();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      wakeLock?.release();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);
}

/** Asks once for permission to notify when rest ends (only if never asked). */
export function useNotificationPermission(): void {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      requestNotificationPermission();
    }
  }, []);
}

/**
 * While `active`: warns before the tab is closed or reloaded, and turns the
 * browser back button into `onBack` instead of leaving the workout.
 */
export function useLeaveGuard(active: boolean, onBack: () => void): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    window.history.pushState(null, "", window.location.href);
    const handler = () => {
      window.history.pushState(null, "", window.location.href);
      onBack();
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [active, onBack]);
}

/** Whole seconds since `start`, updated every second; 0 until `start` is known. */
export function useElapsedSeconds(start: Date | null): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!start) return;
    const tick = () => setElapsed(Math.floor((Date.now() - start.getTime()) / 1000));
    // Right away (a resumed workout should not sit at 0:00), then every second.
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [start]);

  return elapsed;
}
