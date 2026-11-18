import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { makeImportedSession, makeImportedSet } from "@/lib/import/testRecords";
import type { VariantState } from "@/types";
import { sharedStrengthEvidence, withTargetEvidence } from "./sharedEvidence";
import { strengthEvidenceOf } from "./strength";
import { makeSession, makeSet } from "./testFixtures";
import { seedVariantState, targetStrengthSets } from "./variant";

const at = new Date("2026-11-10T18:00:00Z");

function workouts() {
  return [
    makeSession({ id: "w1", completedAt: at, sets: [makeSet("squat", "T1", { id: "s1", completedAt: at, weight: 200 })] }),
    makeSession({ id: "w2", completedAt: at, sets: [makeSet("bench", "T1", { id: "s2", completedAt: at, weight: 150 })] }),
  ];
}

function imported() {
  return [
    makeImportedSession([makeImportedSet({ exerciseName: "Made-up squat", mappedExerciseId: "squat", weightPerImplementLb: 185, reps: 5 })], {
      id: "imp-1",
      startedAt: new Date("2026-10-01T18:00:00Z"),
    }),
  ];
}

function handSetVariant(): VariantState {
  const base = seedVariantState({
    liftId: "squat",
    exerciseId: "bulgarian_split_squat",
    tier: "T1",
    liftState: undefined,
    equipment: DEFAULT_USER_PROFILE.settings.equipment,
  });
  return { ...base, weight: 60, plannedWeight: 60, setByHandAt: at };
}

describe("sharedStrengthEvidence", () => {
  it("gives back the identical array for the same inputs", () => {
    const w = workouts();
    const i = imported();
    const first = sharedStrengthEvidence(w, i, undefined);
    expect(sharedStrengthEvidence(w, i, undefined)).toBe(first);
  });

  it("gives back the identical array for new lists of the same rows (another hook's live query)", () => {
    const w = workouts();
    const i = imported();
    const first = sharedStrengthEvidence(w, i);
    expect(sharedStrengthEvidence([...w], [...i])).toBe(first);
  });

  it("builds afresh when a row, the overrides or the list changes, equal to an uncached build", () => {
    const w = workouts();
    const i = imported();
    const first = sharedStrengthEvidence(w, i);

    const changedRow = [w[0], { ...w[1], sets: [makeSet("bench", "T1", { id: "s2", completedAt: at, weight: 155 })] }];
    const afterRow = sharedStrengthEvidence(changedRow, i);
    expect(afterRow).not.toBe(first);
    expect(afterRow).toEqual(strengthEvidenceOf(changedRow, i));

    const fewer = [w[0]];
    const afterFewer = sharedStrengthEvidence(fewer, i);
    expect(afterFewer).not.toBe(afterRow);
    expect(afterFewer).toEqual(strengthEvidenceOf(fewer, i));

    const overrides = {};
    const afterOverrides = sharedStrengthEvidence(fewer, i, overrides);
    expect(afterOverrides).not.toBe(afterFewer);
    expect(afterOverrides).toEqual(strengthEvidenceOf(fewer, i, overrides));

    const otherImported = imported();
    const afterImported = sharedStrengthEvidence(fewer, otherImported, overrides);
    expect(afterImported).not.toBe(afterOverrides);
    expect(afterImported).toEqual(strengthEvidenceOf(fewer, otherImported, overrides));
  });

  it("keeps one entry: going back to earlier inputs builds again, with the same content", () => {
    const a = workouts();
    const b = workouts();
    const i = imported();
    const fromA = sharedStrengthEvidence(a, i);
    sharedStrengthEvidence(b, i);
    const again = sharedStrengthEvidence(a, i);
    expect(again).not.toBe(fromA);
    expect(again).toEqual(fromA);
  });
});

describe("withTargetEvidence", () => {
  it("adds the hand-set home weights, the same array while the logged array and home rows are the same", () => {
    const logged = strengthEvidenceOf(workouts(), imported());
    const variants = [handSetVariant()];
    const first = withTargetEvidence(logged, variants);
    expect(first).toEqual([...logged, ...targetStrengthSets(variants)]);
    expect(first.length).toBe(logged.length + 1);
    expect(withTargetEvidence(logged, [...variants])).toBe(first);

    const changed = [{ ...variants[0], weight: 65 }];
    const afterChange = withTargetEvidence(logged, changed);
    expect(afterChange).not.toBe(first);
    expect(afterChange).toEqual([...logged, ...targetStrengthSets(changed)]);
  });

  it("is the logged array itself when no home weight is set by hand", () => {
    const logged = strengthEvidenceOf(workouts(), imported());
    expect(withTargetEvidence(logged, [])).toBe(logged);
  });
});
