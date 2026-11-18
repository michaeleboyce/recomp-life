import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import type { UserSettings } from "@/types";
import { REMOVED_STAMP_TTL_MS, mergeSettings, stampSettingsChanges, stampsOf } from "./settingsMerge";

const NOW = Date.UTC(2026, 10, 18, 12);
const base = (): UserSettings => JSON.parse(JSON.stringify(DEFAULT_USER_PROFILE.settings)) as UserSettings;
const weight = (w: number, setAt = NOW) => ({ weight: w, setAt });
const key = (...path: string[]) => JSON.stringify(path);
/** A field this file does not know, where null is a value ("no limit") and absent is "the default". */
type WithLimit = UserSettings & { sessionMinutes?: number | null };

describe("stampSettingsChanges", () => {
  it("stamps only the paths that changed, each map entry on its own", () => {
    const before = { ...base(), accessoryWeights: { curl: weight(20), row: weight(40) } };
    const after = { ...before, theme: "light" as const, accessoryWeights: { curl: weight(25), row: weight(40) } };
    const stamps = stampsOf(stampSettingsChanges(before, after, NOW));
    expect(stamps).toEqual({ [key("theme")]: NOW, [key("accessoryWeights", "curl")]: NOW });
  });

  it("a removed entry keeps a stamp, and earlier stamps are kept", () => {
    const first = stampSettingsChanges(base(), { ...base(), accessoryWeights: { curl: weight(20) } }, NOW - 10);
    const second = stampSettingsChanges(first, { ...first, accessoryWeights: {} }, NOW);
    expect(second.accessoryWeights).toEqual({});
    expect(stampsOf(second)).toEqual({ [key("accessoryWeights", "curl")]: NOW });
  });

  it("an explicit null is a change from absent, and back", () => {
    const limited = stampSettingsChanges(base(), { ...base(), sessionMinutes: null } as WithLimit, NOW - 10);
    expect(stampsOf(limited)).toEqual({ [key("sessionMinutes")]: NOW - 10 });
    const { sessionMinutes: _dropped, ...withoutLimit } = limited as WithLimit;
    void _dropped;
    expect(stampsOf(stampSettingsChanges(limited, withoutLimit as UserSettings, NOW))).toEqual({
      [key("sessionMinutes")]: NOW,
    });
  });

  it("goes two levels into the per-location preferences", () => {
    const after = { ...base(), exercisePreferencesByLocation: { home: { dip: "blocked" as const } } };
    expect(stampsOf(stampSettingsChanges(base(), after, NOW))).toEqual({
      [key("exercisePreferencesByLocation", "home", "dip")]: NOW,
    });
  });

  it("drops a removal's stamp once it is older than the time it is kept", () => {
    const old = { ...base(), fieldStamps: { [key("accessoryWeights", "gone")]: NOW - REMOVED_STAMP_TTL_MS - 1 } };
    expect(stampsOf(stampSettingsChanges(old, { ...old, theme: "light" }, NOW))).toEqual({ [key("theme")]: NOW });
  });
});

describe("mergeSettings", () => {
  const stamped = (settings: UserSettings, change: Partial<UserSettings>, at: number) =>
    stampSettingsChanges(settings, { ...settings, ...change }, at);

  it("takes each path from the copy that changed it last", () => {
    const local = stamped(base(), { theme: "light" }, NOW - 5);
    const server = stamped(base(), { accessoryWeights: { curl: weight(25) } }, NOW - 1);
    const merge = mergeSettings(local, server, NOW);
    expect(merge.settings.theme).toBe("light");
    expect(merge.settings.accessoryWeights).toEqual({ curl: weight(25) });
    expect(merge).toMatchObject({ serverBehind: true, localBehind: true });
  });

  it("a removal stamped later beats the other copy's entry", () => {
    const both = stamped(base(), { accessoryWeights: { curl: weight(20) } }, NOW - 10);
    const local = stamped(both, { accessoryWeights: {} }, NOW - 1);
    const merge = mergeSettings(local, both, NOW);
    expect(merge.settings.accessoryWeights).toEqual({});
    expect(merge.serverBehind).toBe(true);
    expect(merge.localBehind).toBe(false);
  });

  it("an entry added later beats the other copy's older removal", () => {
    const both = stamped(base(), { accessoryWeights: { curl: weight(20) } }, NOW - 10);
    const removed = stamped(both, { accessoryWeights: {} }, NOW - 5);
    const readded = stamped(both, { accessoryWeights: { curl: weight(30) } }, NOW - 1);
    expect(mergeSettings(removed, readded, NOW).settings.accessoryWeights).toEqual({ curl: weight(30) });
  });

  it("keeps an explicit null and does not mistake it for absent", () => {
    const local = stampSettingsChanges(base(), { ...base(), sessionMinutes: null } as WithLimit, NOW - 1);
    const merge = mergeSettings(local, base(), NOW);
    expect("sessionMinutes" in merge.settings).toBe(true);
    expect((merge.settings as WithLimit).sessionMinutes).toBeNull();
    expect(merge.serverBehind).toBe(true);
  });

  it("unstamped on both, the server's copy wins, as before stamps existed", () => {
    const merge = mergeSettings({ ...base(), theme: "light" }, base(), NOW);
    expect(merge.settings.theme).toBe(base().theme);
    expect(merge).toMatchObject({ serverBehind: false, localBehind: true });
  });

  it("identical copies need nothing from either side", () => {
    const settings = stamped(base(), { theme: "light" }, NOW - 1);
    expect(mergeSettings(settings, JSON.parse(JSON.stringify(settings)), NOW)).toMatchObject({
      serverBehind: false,
      localBehind: false,
    });
  });

  it("a revived Date and its ISO string are the same value", () => {
    const plan = {
      exerciseId: "squat",
      liftId: "squat",
      tier: "T1" as const,
      sets: [{ weight: 200, reps: 3 }],
      planSets: [],
      createdAt: "2026-11-18T10:00:00.000Z",
    };
    const local = stamped(base(), { nextSetPlans: { "squat|T1": plan } }, NOW - 1);
    const server = JSON.parse(JSON.stringify(local)) as UserSettings;
    (server.nextSetPlans!["squat|T1"] as unknown as { createdAt: Date }).createdAt = new Date(plan.createdAt);
    expect(mergeSettings(local, server, NOW).localBehind).toBe(false);
  });
});
