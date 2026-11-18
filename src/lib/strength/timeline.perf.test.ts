import { describe, expect, it } from "vitest";
import { muscleStrengthIndex } from "./muscleIndex";
import { day, t1Session } from "./testHelpers";
import { TREND_SMOOTHING, muscleTimeline, smoothedEstimate, strengthTimeline, weeklyShares } from "./timeline";
import type { StrengthSet } from "./types";

/** About 12,000 made-up sets: years of four lifts and their home versions. */
function manySets(): StrengthSet[] {
  const sets: StrengthSet[] = [];
  const plan: Array<[string, number, boolean]> = [
    ["squat", 200, false],
    ["bench", 150, false],
    ["deadlift", 250, false],
    ["ohp", 95, false],
    ["goblet_squat", 60, false],
    ["db_bench", 55, true],
    ["db_rdl", 50, true],
    ["db_shoulder_press", 35, true],
  ];
  let n = 0;
  for (let d = 0; sets.length < 12_000; d += 1) {
    const [exerciseId, base, perHand] = plan[d % plan.length];
    sets.push(
      ...t1Session({
        sessionId: `s${n++}`,
        exerciseId,
        weight: base + Math.floor(d / 30) * 2.5,
        perHand,
        amrapReps: 3 + (d % 5),
        day: Math.floor(d / 2),
        sets: 5,
      })
    );
  }
  return sets;
}

describe("timeline speed (M9)", () => {
  it("builds every lift's and a muscle's chart from about 12,000 sets quickly", () => {
    const sets = manySets();
    expect(sets.length).toBeGreaterThanOrEqual(12_000);
    const now = day(Math.ceil(sets.length / 10) + 1).getTime();
    const start = performance.now();
    for (const lift of ["squat", "bench", "deadlift", "ohp"]) {
      const tl = strengthTimeline(lift, sets, { now });
      for (const halfLifeDays of Object.values(TREND_SMOOTHING)) smoothedEstimate(tl, { halfLifeDays });
      weeklyShares(tl, { halfLifeDays: TREND_SMOOTHING.standard });
    }
    const index = muscleStrengthIndex(sets);
    const quads = muscleTimeline("quads", index, sets, { now });
    smoothedEstimate(quads, { halfLifeDays: TREND_SMOOTHING.standard });
    const elapsed = performance.now() - start;
    console.info(`timeline from ${sets.length} sets: ${elapsed.toFixed(0)} ms`);
    // Generous for a loaded test machine; this runs once per change of data, not per render.
    expect(elapsed).toBeLessThan(3000);
  });
});
