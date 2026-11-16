import { describe, it, expect } from "vitest";
import { calculateE1RM } from "@/lib/e1rm";
import { MUSCLE_INDEX, MUSCLE_WEIGHTS } from "./coefficients";
import { muscleStrengthIndex } from "./muscleIndex";
import { t1Session } from "./testHelpers";
import type { StrengthSet } from "./types";

const BSS = "bulgarian_split_squat";

function bssSessions(weightsPerHand: number[], startDay = 0): StrengthSet[] {
  return weightsPerHand.flatMap((w, i) =>
    t1Session({ sessionId: `h${startDay + i}`, exerciseId: BSS, weight: w, perHand: true, amrapReps: 8, day: startDay + 3 * i })
  );
}

describe("muscleStrengthIndex", () => {
  it("H7: a quads trend appears from Bulgarian split squat data alone", () => {
    const index = muscleStrengthIndex(bssSessions([40, 45, 50]));
    const quads = index.quads!;
    expect(quads.map((p) => p.index)).toEqual([
      MUSCLE_INDEX.base,
      Math.round((1000 * calculateE1RM(90, 8)!) / calculateE1RM(80, 8)!) / 10,
      Math.round((1000 * calculateE1RM(100, 8)!) / calculateE1RM(80, 8)!) / 10,
    ]);
    expect(quads[2].contributors).toEqual([
      { exerciseId: BSS, weight: MUSCLE_WEIGHTS.primary, relative: quads[2].index },
    ]);
    // Secondary muscles of the split squat get a trend too, at half weight.
    expect(index.hamstrings![0].contributors[0].weight).toBe(MUSCLE_WEIGHTS.secondary);
    // Muscles the exercise does not train get none.
    expect(index.chest).toBeUndefined();
  });

  it("brings a new exercise in at the muscle's current level, so it adds only its changes", () => {
    const squat = [0, 3, 6].flatMap((d, i) =>
      t1Session({ sessionId: `g${i}`, exerciseId: "squat", weight: 200 + 10 * i, amrapReps: 5, day: d })
    );
    // The split squat starts on day 9 and holds steady.
    const sets = [...squat, ...bssSessions([50, 50], 9)];
    const quads = muscleStrengthIndex(sets).quads!;
    const beforeEntry = quads[2].index;
    expect(quads[3].index).toBeCloseTo(beforeEntry, 1);
    expect(quads[4].index).toBeCloseTo(beforeEntry, 1);
  });

  it("weights primary muscles 1 and secondary muscles 0.5", () => {
    // Glutes: squat primary, deadlift primary. Hamstrings: deadlift primary, squat none.
    // Quads: squat primary (1), deadlift secondary (0.5).
    const squat = [0, 7].flatMap((d, i) =>
      t1Session({ sessionId: `s${i}`, exerciseId: "squat", weight: 200, amrapReps: 5, day: d })
    );
    const deadlift = [
      ...t1Session({ sessionId: "d0", exerciseId: "deadlift", weight: 300, amrapReps: 5, day: 1 }),
      ...t1Session({ sessionId: "d1", exerciseId: "deadlift", weight: 330, amrapReps: 5, day: 8 }),
    ];
    const quads = muscleStrengthIndex([...squat, ...deadlift]).quads!;
    const last = quads[quads.length - 1];
    const deadliftRelative = (100 * calculateE1RM(330, 5)!) / calculateE1RM(300, 5)!;
    const expected = (1 * 100 + 0.5 * deadliftRelative) / 1.5;
    expect(last.index).toBeCloseTo(expected, 1);
    expect(last.contributors.map((c) => [c.exerciseId, c.weight])).toEqual([
      ["deadlift", 0.5],
      ["squat", 1],
    ]);
  });

  it(`drops an exercise not done for ${MUSCLE_INDEX.staleAfterDays} days`, () => {
    const old = t1Session({ sessionId: "g", exerciseId: "squat", weight: 200, amrapReps: 5, day: 0 });
    const later = bssSessions([50, 55], MUSCLE_INDEX.staleAfterDays + 10);
    const quads = muscleStrengthIndex([...old, ...later]).quads!;
    expect(quads[quads.length - 1].contributors.map((c) => c.exerciseId)).toEqual([BSS]);
  });

  it("is empty with no estimates", () => {
    expect(muscleStrengthIndex([])).toEqual({});
  });
});
