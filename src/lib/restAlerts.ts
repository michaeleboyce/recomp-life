/**
 * Rest alerts: what to tell the lifter, and when, while a rest runs with the app in
 * the background. Pure: the native layer (`src/native/restNotifications.ts`) turns
 * these into phone notifications, which a paired watch repeats as a tap on the wrist.
 */

/** Seconds before the end of a rest at which the "get ready" warning is given. */
export const REST_WARNING_SECONDS = 10;

/** Fixed ids, so scheduling again replaces the alerts of the rest before. */
export const REST_END_ALERT_ID = 7101;
export const REST_WARNING_ALERT_ID = 7102;
export const REST_ALERT_IDS: readonly number[] = [REST_END_ALERT_ID, REST_WARNING_ALERT_ID];

export interface RestAlert {
  id: number;
  at: Date;
  title: string;
  body: string;
}

export interface RestAlertInput {
  /** The moment the rest has `remainingSeconds` left. */
  now: Date;
  remainingSeconds: number;
  /** What comes after the rest, e.g. "Next: set 3 of 5 · 190 lbs". */
  nextLabel?: string;
}

/**
 * The alerts for a rest with `remainingSeconds` left at `now`: one when it ends, and
 * one REST_WARNING_SECONDS before that. The warning is left out of a rest too short
 * for it to be useful (under twice the warning time), and nothing is planned for a
 * rest that is already over.
 */
export function planRestAlerts({ now, remainingSeconds, nextLabel }: RestAlertInput): RestAlert[] {
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return [];
  const endMs = now.getTime() + remainingSeconds * 1000;
  const alerts: RestAlert[] = [];
  if (remainingSeconds >= REST_WARNING_SECONDS * 2) {
    alerts.push({
      id: REST_WARNING_ALERT_ID,
      at: new Date(endMs - REST_WARNING_SECONDS * 1000),
      title: `${REST_WARNING_SECONDS} seconds left`,
      body: "Get ready for your next set.",
    });
  }
  alerts.push({
    id: REST_END_ALERT_ID,
    at: new Date(endMs),
    title: "Rest over",
    body: nextLabel?.trim() || "Time for your next set.",
  });
  return alerts;
}
