import { describe, expect, it } from "vitest";
import {
  REST_END_ALERT_ID,
  REST_WARNING_ALERT_ID,
  REST_WARNING_SECONDS,
  planRestAlerts,
} from "./restAlerts";

const NOW = new Date("2026-11-18T10:00:00.000Z");
const secondsAfterNow = (alert: { at: Date }) => (alert.at.getTime() - NOW.getTime()) / 1000;

describe("planRestAlerts", () => {
  it("plans a warning before the end and an alert at the end", () => {
    const alerts = planRestAlerts({ now: NOW, remainingSeconds: 180 });
    expect(alerts.map((a) => a.id)).toEqual([REST_WARNING_ALERT_ID, REST_END_ALERT_ID]);
    expect(secondsAfterNow(alerts[0])).toBe(180 - REST_WARNING_SECONDS);
    expect(secondsAfterNow(alerts[1])).toBe(180);
    expect(alerts[0].title).toBe(`${REST_WARNING_SECONDS} seconds left`);
    expect(alerts[1].title).toBe("Rest over");
  });

  it("says what comes next when it is known", () => {
    const [, end] = planRestAlerts({
      now: NOW,
      remainingSeconds: 120,
      nextLabel: "Next: set 3 of 5 · 190 lbs",
    });
    expect(end.body).toBe("Next: set 3 of 5 · 190 lbs");
  });

  it("falls back to a plain line when the next set is not known", () => {
    expect(planRestAlerts({ now: NOW, remainingSeconds: 120 })[1].body).toBe("Time for your next set.");
    expect(planRestAlerts({ now: NOW, remainingSeconds: 120, nextLabel: "  " })[1].body).toBe(
      "Time for your next set."
    );
  });

  it("leaves the warning out of a rest shorter than twice the warning time", () => {
    const short = planRestAlerts({ now: NOW, remainingSeconds: REST_WARNING_SECONDS * 2 - 1 });
    expect(short.map((a) => a.id)).toEqual([REST_END_ALERT_ID]);
    const justLongEnough = planRestAlerts({ now: NOW, remainingSeconds: REST_WARNING_SECONDS * 2 });
    expect(justLongEnough.map((a) => a.id)).toEqual([REST_WARNING_ALERT_ID, REST_END_ALERT_ID]);
  });

  it("plans nothing for a rest that is over or unreadable", () => {
    expect(planRestAlerts({ now: NOW, remainingSeconds: 0 })).toEqual([]);
    expect(planRestAlerts({ now: NOW, remainingSeconds: -5 })).toEqual([]);
    expect(planRestAlerts({ now: NOW, remainingSeconds: Number.NaN })).toEqual([]);
  });
});
