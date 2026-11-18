import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REST_ALERT_IDS, planRestAlerts } from "@/lib/restAlerts";

const plugin = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
}));
const haptics = vi.hoisted(() => ({ notification: vi.fn() }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: plugin }));
vi.mock("@capacitor/haptics", () => ({
  Haptics: haptics,
  NotificationType: { Success: "SUCCESS" },
}));

import {
  cancelRestAlerts,
  requestRestAlertPermission,
  restEndHaptic,
  scheduleRestAlerts,
} from "./restNotifications";

const globals = globalThis as { Capacitor?: unknown };
const NOW = new Date("2026-11-18T10:00:00.000Z");
const alerts = planRestAlerts({ now: NOW, remainingSeconds: 180, nextLabel: "Next: set 2 of 5" });
const cancelled = { notifications: REST_ALERT_IDS.map((id) => ({ id })) };

beforeEach(() => {
  vi.clearAllMocks();
  plugin.checkPermissions.mockResolvedValue({ display: "granted" });
  plugin.requestPermissions.mockResolvedValue({ display: "granted" });
  plugin.schedule.mockResolvedValue({ notifications: [] });
  plugin.cancel.mockResolvedValue(undefined);
  haptics.notification.mockResolvedValue(undefined);
});

afterEach(() => {
  delete globals.Capacitor;
});

describe("in a browser", () => {
  it("does nothing and never loads the plugins", async () => {
    await scheduleRestAlerts(alerts);
    await cancelRestAlerts();
    await restEndHaptic();
    expect(await requestRestAlertPermission()).toBe(false);
    expect(plugin.schedule).not.toHaveBeenCalled();
    expect(plugin.cancel).not.toHaveBeenCalled();
    expect(plugin.checkPermissions).not.toHaveBeenCalled();
    expect(haptics.notification).not.toHaveBeenCalled();
  });
});

describe("in the phone app", () => {
  beforeEach(() => {
    globals.Capacitor = { isNativePlatform: () => true };
  });

  it("clears the earlier rest's alerts, then schedules these, hidden while the app is open", async () => {
    await scheduleRestAlerts(alerts);
    expect(plugin.cancel).toHaveBeenCalledWith(cancelled);
    expect(plugin.schedule).toHaveBeenCalledTimes(1);
    expect(plugin.schedule.mock.calls[0][0].notifications).toEqual(
      alerts.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        schedule: { at: a.at },
        foreground: false,
      }))
    );
    expect(plugin.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      plugin.schedule.mock.invocationCallOrder[0]
    );
  });

  it("schedules nothing without permission", async () => {
    plugin.checkPermissions.mockResolvedValue({ display: "denied" });
    await scheduleRestAlerts(alerts);
    expect(plugin.schedule).not.toHaveBeenCalled();
  });

  it("only clears when there is nothing to schedule", async () => {
    await scheduleRestAlerts([]);
    expect(plugin.cancel).toHaveBeenCalledWith(cancelled);
    expect(plugin.schedule).not.toHaveBeenCalled();
  });

  it("runs a cancel after the schedule it follows, never before", async () => {
    let finishSchedule: () => void = () => {};
    plugin.schedule.mockImplementation(
      () => new Promise((resolve) => (finishSchedule = () => resolve({ notifications: [] })))
    );
    const scheduled = scheduleRestAlerts(alerts);
    const cancelledLater = cancelRestAlerts();
    await vi.waitFor(() => expect(plugin.schedule).toHaveBeenCalledTimes(1));
    // The schedule's own clearing call has run; the later cancel is still waiting.
    expect(plugin.cancel).toHaveBeenCalledTimes(1);
    finishSchedule();
    await scheduled;
    await cancelledLater;
    expect(plugin.cancel).toHaveBeenCalledTimes(2);
  });

  it("keeps working after a plugin call fails", async () => {
    plugin.schedule.mockRejectedValueOnce(new Error("no"));
    await scheduleRestAlerts(alerts);
    await scheduleRestAlerts(alerts);
    expect(plugin.schedule).toHaveBeenCalledTimes(2);
  });

  it("asks for permission only when it has not been decided", async () => {
    expect(await requestRestAlertPermission()).toBe(true);
    expect(plugin.requestPermissions).not.toHaveBeenCalled();

    plugin.checkPermissions.mockResolvedValue({ display: "denied" });
    expect(await requestRestAlertPermission()).toBe(false);
    expect(plugin.requestPermissions).not.toHaveBeenCalled();

    plugin.checkPermissions.mockResolvedValue({ display: "prompt" });
    expect(await requestRestAlertPermission()).toBe(true);
    expect(plugin.requestPermissions).toHaveBeenCalledTimes(1);
  });

  it("gives the phone's done vibration", async () => {
    await restEndHaptic();
    expect(haptics.notification).toHaveBeenCalledWith({ type: "SUCCESS" });
  });
});
