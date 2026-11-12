"use client";

import { useEffect } from "react";
import { getOfflineWarmList } from "@/lib/offlineWarmList";

/** Ask the service worker to cache the anatomy and exercise media ahead of time. */
async function warmOfflineCache() {
  if (!navigator.onLine) return;
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({ type: "WARM_CACHE", urls: getOfflineWarmList() });
  // The 3D viewer's code is split into build-hashed files that cannot be
  // listed ahead of time. Load it once, then tell the worker every script and
  // style this page has fetched so far so those are cached as well.
  try {
    await import("@/components/Anatomy/Anatomy3DScene");
  } catch {
    return;
  }
  const loaded = performance
    .getEntriesByType("resource")
    .map((entry) => new URL(entry.name, location.href))
    .filter((url) => url.origin === location.origin && url.pathname.startsWith("/_next/static/"))
    .map((url) => url.pathname + url.search);
  registration.active?.postMessage({ type: "WARM_CACHE", urls: [...new Set(loaded)] });
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Service worker registration failed — app works fine without it
    });

    // Wait until the page is idle so warming never competes with first paint.
    const start = () => {
      warmOfflineCache().catch(() => {});
    };
    const idle = window.requestIdleCallback;
    if (idle) {
      const id = idle(start, { timeout: 8000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(start, 4000);
    return () => window.clearTimeout(id);
  }, []);

  return null;
}
