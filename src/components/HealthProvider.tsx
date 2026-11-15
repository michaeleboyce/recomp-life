"use client";

import { useEffect } from "react";
import { importFromAppleHealth } from "@/native/appleHealth";

/**
 * Imports from Apple Health when the app opens and when it returns to the
 * foreground. Does nothing unless Apple Health is connected on this device, and
 * never more often than the import's own minimum interval. Renders nothing.
 */
export function HealthProvider() {
  useEffect(() => {
    const run = () => {
      importFromAppleHealth().catch((error) => {
        console.error("Apple Health import failed:", error);
      });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };

    run();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return null;
}
