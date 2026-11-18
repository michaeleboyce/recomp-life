// Rest alerts on the phone, through the @capacitor/local-notifications and
// @capacitor/haptics plugins. This is the only file that loads them, and it does so on
// demand, so the web build never runs plugin code. In a browser every function here
// does nothing.
//
// The alerts are scheduled with the system when a rest starts, so they fire with the
// app in the background or the phone locked, when the web view's own timer is
// suspended; a paired watch repeats them as a tap on the wrist. With the app in the
// foreground they are not shown (`foreground: false`): the rest screen's own chime and
// vibration cover that case.
//
// Not yet confirmed on a phone: that the alerts fire on time while locked, and that
// the watch repeats them.
import { REST_ALERT_IDS, type RestAlert } from "@/lib/restAlerts";
import { isNativeApp } from "./platform";

// Calls go to the plugin one at a time, in the order they were made, so a cancel
// never overtakes the schedule before it.
let queue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task).catch(() => {
    // The rest timer on screen still works without the alerts.
  });
  return queue;
}

const cancelOptions = { notifications: REST_ALERT_IDS.map((id) => ({ id })) };

/** Asks once for permission to notify; resolves to whether it is granted. */
export async function requestRestAlertPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const current = await LocalNotifications.checkPermissions();
    if (current.display === "granted") return true;
    if (current.display === "denied") return false;
    return (await LocalNotifications.requestPermissions()).display === "granted";
  } catch {
    return false;
  }
}

/** Replaces any alerts scheduled for an earlier rest with these. */
export function scheduleRestAlerts(alerts: RestAlert[]): Promise<void> {
  if (!isNativeApp()) return Promise.resolve();
  return enqueue(async () => {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel(cancelOptions);
    if (alerts.length === 0) return;
    if ((await LocalNotifications.checkPermissions()).display !== "granted") return;
    await LocalNotifications.schedule({
      notifications: alerts.map((alert) => ({
        id: alert.id,
        title: alert.title,
        body: alert.body,
        schedule: { at: alert.at },
        foreground: false,
      })),
    });
  });
}

/** Removes the alerts of a rest that was skipped, finished on screen or left. */
export function cancelRestAlerts(): Promise<void> {
  if (!isNativeApp()) return Promise.resolve();
  return enqueue(async () => {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel(cancelOptions);
  });
}

/** The phone's own "done" vibration, for a rest that ends with the app open. */
export async function restEndHaptic(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // No haptics on this device.
  }
}
