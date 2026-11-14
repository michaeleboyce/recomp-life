// The app-facing side of Apple Health: which source to read from, connecting,
// and running an import with this device's settings. Client-side only.
import { runHealthImport, type HealthImportResult } from "@/lib/data/health";
import { demoHealthData } from "@/lib/health/demoData";
import { getHealthSettings, saveHealthSettings } from "@/lib/health/deviceSettings";
import { createFakeHealthSource } from "@/lib/health/fakeSource";
import { autoImportDue, importSince } from "@/lib/health/importWindow";
import type { HealthCategory, HealthSource } from "@/lib/health/types";
import { createHealthKitSource } from "./healthkit";
import { isNativeApp } from "./platform";

/**
 * Set this localStorage key to "1" in a browser to try the Apple Health screens
 * with made-up data. It has no effect inside the iPhone app.
 */
export const HEALTH_DEMO_KEY = "recomp-health-demo";

function demoRequested(): boolean {
  try {
    return localStorage.getItem(HEALTH_DEMO_KEY) === "1";
  } catch {
    return false;
  }
}

/** Apple Health in the iPhone app; made-up data when the demo is on; otherwise unavailable. */
export function getHealthSource(now: Date = new Date()): HealthSource {
  if (isNativeApp()) return createHealthKitSource();
  if (demoRequested()) return createFakeHealthSource(demoHealthData(now));
  return createFakeHealthSource({ available: false });
}

/** Shows the permission sheet for the chosen categories and remembers that it was shown. */
export async function connectAppleHealth(categories: readonly HealthCategory[]): Promise<void> {
  await getHealthSource().requestAccess(categories);
  saveHealthSettings({ connected: true, categories: [...categories] });
}

/** Stops importing on this device. Rows already imported stay in the log. */
export function disconnectAppleHealth(): void {
  saveHealthSettings({ connected: false });
}

let running: Promise<HealthImportResult | null> | null = null;

/**
 * Imports from Apple Health with this device's settings. Resolves to null when
 * there is nothing to do: not connected, unavailable, or (unless `force`) an
 * import ran too recently. Calls made while one is running share its result.
 */
export function importFromAppleHealth(
  options: { force?: boolean; now?: Date } = {}
): Promise<HealthImportResult | null> {
  if (running) return running;
  running = (async () => {
    const now = options.now ?? new Date();
    const settings = getHealthSettings();
    if (!settings.connected || settings.categories.length === 0) return null;
    if (!options.force && !autoImportDue(settings.lastImportAt, now)) return null;

    const source = getHealthSource(now);
    if (!(await source.isAvailable()).available) return null;

    const result = await runHealthImport(source, {
      categories: settings.categories,
      since: importSince(settings.lastImportAt, now),
      now,
    });
    saveHealthSettings({ lastImportAt: now.getTime() });
    return result;
  })().finally(() => {
    running = null;
  });
  return running;
}
