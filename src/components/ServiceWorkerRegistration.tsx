"use client";

import { useEffect } from "react";
import { getOfflineWarmList } from "@/lib/offlineWarmList";

/** Ask the service worker to cache the anatomy and exercise media ahead of time. */
async function warmOfflineCache() {
  if (!navigator.onLine) return;
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({ type: "WARM_CACHE", urls: getOfflineWarmList() });
  // Fetching the 3D viewer's code here lets the service worker cache its
  // build-hashed files too, which cannot be listed by URL.
  void import("@/components/Anatomy/Anatomy3DScene").catch(() => {});
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
