import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_HEALTH_SETTINGS,
  getHealthSettings,
  parseHealthSettings,
  saveHealthSettings,
} from "./deviceSettings";
import {
  autoImportDue,
  HEALTH_AUTO_IMPORT_MINUTES,
  HEALTH_FIRST_IMPORT_DAYS,
  HEALTH_OVERLAP_DAYS,
  importSince,
} from "./importWindow";

const DAY = 86_400_000;
const now = new Date(2026, 10, 12, 20);

afterEach(() => localStorage.clear());

describe("importSince", () => {
  it("reaches a year back the first time", () => {
    expect(importSince(null, now).getTime()).toBe(now.getTime() - HEALTH_FIRST_IMPORT_DAYS * DAY);
  });

  it("re-reads a few days before the last import", () => {
    const last = now.getTime() - 2 * 60 * 60 * 1000;
    expect(importSince(last, now).getTime()).toBe(last - HEALTH_OVERLAP_DAYS * DAY);
  });

  it("never reaches further back than the first import would", () => {
    const longAgo = now.getTime() - 800 * DAY;
    expect(importSince(longAgo, now).getTime()).toBe(now.getTime() - HEALTH_FIRST_IMPORT_DAYS * DAY);
  });
});

describe("autoImportDue", () => {
  const minutesAgo = (m: number) => now.getTime() - m * 60 * 1000;

  it("is due when nothing has been imported or enough time has passed", () => {
    expect(autoImportDue(null, now)).toBe(true);
    expect(autoImportDue(minutesAgo(HEALTH_AUTO_IMPORT_MINUTES), now)).toBe(true);
  });

  it("is not due right after an import", () => {
    expect(autoImportDue(minutesAgo(HEALTH_AUTO_IMPORT_MINUTES - 1), now)).toBe(false);
  });
});

describe("health device settings", () => {
  it("start disconnected with every category on", () => {
    expect(getHealthSettings()).toEqual(DEFAULT_HEALTH_SETTINGS);
  });

  it("survive a round trip and announce the change", () => {
    let announced = 0;
    const listener = () => announced++;
    window.addEventListener("recomp-health-changed", listener);
    saveHealthSettings({ connected: true, categories: ["sleep"], lastImportAt: 123 });
    window.removeEventListener("recomp-health-changed", listener);
    expect(getHealthSettings()).toEqual({ connected: true, categories: ["sleep"], lastImportAt: 123 });
    expect(announced).toBe(1);
  });

  it("ignore malformed or unknown stored values", () => {
    expect(parseHealthSettings("not json")).toEqual(DEFAULT_HEALTH_SETTINGS);
    expect(
      parseHealthSettings(JSON.stringify({ connected: "yes", categories: ["sleep", "bogus"], lastImportAt: "x" }))
    ).toEqual({ connected: false, categories: ["sleep"], lastImportAt: null });
  });
});
