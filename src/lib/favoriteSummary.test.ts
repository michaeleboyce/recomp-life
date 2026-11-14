import { describe, expect, it } from "vitest";
import type { FavoriteSnapshotEntry, FavoriteWorkout } from "@/types";
import { summariseFavorite } from "./favoriteSummary";

const NOW = new Date(2026, 10, 12, 10, 0, 0);

function fav(overrides: Partial<FavoriteWorkout> = {}, snapshot?: FavoriteSnapshotEntry[]): FavoriteWorkout {
  return {
    id: "f1",
    clientId: "c1",
    name: "Heavy legs",
    templateId: "A1",
    location: "gym",
    includeWarmUps: false,
    selectedAccessories: [],
    substitutes: {},
    edits: [],
    snapshot: snapshot ?? [
      { exerciseId: "squat", tier: "T1", sets: 5, reps: 3, weight: 190, isAMRAP: false },
      { exerciseId: "ab_rollout", tier: "T3", sets: 3, reps: 15, weight: 0, isAMRAP: true },
    ],
    createdAt: new Date(2026, 10, 1),
    updatedAt: 0,
    deletedAt: null,
    synced: false,
    ...overrides,
  } as FavoriteWorkout;
}

describe("summariseFavorite", () => {
  it("labels the day and location", () => {
    const s = summariseFavorite(fav(), NOW);
    expect(s.dayLabel).toBe("A1 · Squat day");
    expect(s.locationLabel).toBe("Gym");
    expect(summariseFavorite(fav({ location: "home" }), NOW).locationLabel).toBe("Home");
  });

  it("lists exercises from the snapshot", () => {
    const s = summariseFavorite(fav(), NOW);
    expect(s.exerciseCount).toBe(2);
    expect(s.exercises[0]).toMatchObject({ name: "Barbell Squat", tierLabel: "T1", text: "5×3 · 190 lbs" });
  });

  it("shows zero weight as bodyweight only for bodyweight exercises", () => {
    const s = summariseFavorite(
      fav({}, [
        { exerciseId: "ab_rollout", tier: "T3", sets: 3, reps: 15, weight: 0, isAMRAP: false },
        { exerciseId: "squat", tier: "T1", sets: 5, reps: 3, weight: 0, isAMRAP: false },
      ]),
      NOW
    );
    expect(s.exercises[0].text).toBe("3×15 · bodyweight");
    expect(s.exercises[1].text).toBe("5×3 · 0 lbs");
  });

  it("describes when it was last used", () => {
    const at = (d: Date | undefined) => summariseFavorite(fav({ lastUsedAt: d }), NOW).lastUsedText;
    expect(at(undefined)).toBe("Never used");
    expect(at(new Date(2026, 10, 12, 1))).toBe("Today");
    expect(at(new Date(2026, 10, 11, 23))).toBe("Yesterday");
    expect(at(new Date(2026, 10, 9))).toBe("3 days ago");
    expect(at(new Date(2026, 9, 1))).toMatch(/1\s+Oct/);
  });
});
