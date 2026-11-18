import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REST_END_ALERT_ID, REST_WARNING_ALERT_ID, REST_WARNING_SECONDS, type RestAlert } from "@/lib/restAlerts";
import { useWorkoutStore } from "@/stores/workoutStore";
import { RestTimer } from "./RestTimer";

const native = vi.hoisted(() => ({
  scheduleRestAlerts: vi.fn<(alerts: RestAlert[]) => Promise<void>>(() => Promise.resolve()),
  cancelRestAlerts: vi.fn(() => Promise.resolve()),
  restEndHaptic: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/native/restNotifications", () => native);
vi.mock("@/lib/audio", () => ({
  playTimerChime: vi.fn(),
  vibrateTimer: vi.fn(),
  sendTimerNotification: vi.fn(),
}));

const NOW = new Date("2026-11-18T10:00:00.000Z");
const lastScheduled = () => native.scheduleRestAlerts.mock.calls.at(-1)![0];
const secondsAfterNow = (alert: RestAlert) => (alert.at.getTime() - NOW.getTime()) / 1000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  act(() => useWorkoutStore.getState().reset());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RestTimer: background alerts", () => {
  it("schedules the warning and the end alert when a rest starts, with what comes next", () => {
    render(<RestTimer nextLabel="Next: set 2 of 5 · 245 lbs" />);
    expect(native.scheduleRestAlerts).not.toHaveBeenCalled();

    act(() => useWorkoutStore.getState().startRestTimer(180, "T1"));

    expect(native.scheduleRestAlerts).toHaveBeenCalledTimes(1);
    const alerts = lastScheduled();
    expect(alerts.map((a) => a.id)).toEqual([REST_WARNING_ALERT_ID, REST_END_ALERT_ID]);
    expect(secondsAfterNow(alerts[0])).toBe(180 - REST_WARNING_SECONDS);
    expect(secondsAfterNow(alerts[1])).toBe(180);
    expect(alerts[1].body).toBe("Next: set 2 of 5 · 245 lbs");
  });

  it("moves the alerts when the rest is extended", () => {
    render(<RestTimer />);
    act(() => useWorkoutStore.getState().startRestTimer(180, "T1"));

    fireEvent.click(screen.getByRole("button", { name: "+15s" }));

    expect(native.scheduleRestAlerts).toHaveBeenCalledTimes(2);
    expect(secondsAfterNow(lastScheduled().at(-1)!)).toBe(195);
  });

  it("removes the alerts when the rest is skipped", () => {
    render(<RestTimer />);
    act(() => useWorkoutStore.getState().startRestTimer(180, "T1"));
    native.cancelRestAlerts.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /skip rest/i }));

    expect(native.cancelRestAlerts).toHaveBeenCalledTimes(1);
    expect(native.scheduleRestAlerts).toHaveBeenCalledTimes(1);
  });

  it("removes the alerts when the workout screen is left mid-rest", () => {
    const { unmount } = render(<RestTimer />);
    act(() => useWorkoutStore.getState().startRestTimer(180, "T1"));
    native.cancelRestAlerts.mockClear();

    unmount();

    expect(native.cancelRestAlerts).toHaveBeenCalledTimes(1);
  });

  it("gives the phone's vibration at the end only when vibration is on", () => {
    const { rerender } = render(<RestTimer vibrationEnabled={false} />);
    act(() => useWorkoutStore.getState().startRestTimer(30, "T3"));
    act(() => useWorkoutStore.setState({ restTimeRemaining: 0 }));
    expect(native.restEndHaptic).not.toHaveBeenCalled();

    rerender(<RestTimer vibrationEnabled />);
    act(() => useWorkoutStore.getState().startRestTimer(30, "T3"));
    act(() => useWorkoutStore.setState({ restTimeRemaining: 0 }));
    expect(native.restEndHaptic).toHaveBeenCalledTimes(1);
  });
});
