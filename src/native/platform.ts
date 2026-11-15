// Where the app is running. The native shell (Capacitor) injects a global
// `Capacitor` object into the web view before any page script runs; reading it
// directly keeps this file free of dependencies and safe during server rendering.

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

/** True inside the iPhone app, false in a browser and on the server. */
export function isNativeApp(): boolean {
  const capacitor = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
  return capacitor?.isNativePlatform?.() === true;
}
