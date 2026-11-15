// Proof that the outcome reported by the progression code says the same thing as the
// old description, which worked it out afterwards by comparing lift states before and
// after a session. Run before that old logic is deleted.
import { describe, expect, it } from "vitest";
import { describeOutcomes as describeFromSnapshots } from "@/components/Log/outcomes";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { rebuildDerived } from "@/lib/rebuild";
import {
  FAIL,
  PARTIAL,
  type SessionOptions,
  rebuildInput,
  runSession,
  startSim,
} from "@/lib/rebuild/testHelpers";
import type { LiftState, WorkoutSession } from "@/types";
import { describeOutcomes } from "./outcomes";

/** The old kind names, where they differ from the outcome type's. */
const OLD_KIND: Record<string, string> = { stageDown: "missed" };

function compare(workouts: WorkoutSession[], rebuilt: ReturnType<typeof rebuildDerived>) {
  const rows: { workoutId: string; old: string[]; now: string[] }[] = [];
  // As the Log did it: the snapshot of the session before is the fallback "before".
  let before: LiftState[] | undefined;
  for (const [workoutId, after] of rebuilt.snapshots) {
    const session = workouts.find((w) => w.id === workoutId)!;
    const old = describeFromSnapshots(session, after, before).map(
      (o) => `${o.exerciseId} ${o.tier} ${o.kind}: ${o.text}`
    );
    const now = describeOutcomes(session, rebuilt.outcomes.get(workoutId)).map(
      (o) => `${o.exerciseId} ${o.tier} ${OLD_KIND[o.kind] ?? o.kind}: ${o.text}`
    );
    rows.push({ workoutId, old, now });
    before = after;
  }
  return rows;
}

describe("outcome kind and text equal the old description", () => {
  it("for every demo workout", () => {
    const data = generateDemoData(new Date(2026, 10, 14, 12, 0, 0));
    const rebuilt = rebuildDerived({
      workouts: data.workouts,
      adjustments: data.liftAdjustments,
      settings: DEFAULT_USER_PROFILE.settings,
    });
    const rows = compare(data.workouts, rebuilt);
    expect(rows).toHaveLength(24);
    for (const row of rows) {
      expect(row.old, row.workoutId).toHaveLength(3);
      expect(row.now, row.workoutId).toEqual(row.old);
    }
    // The demo log exercises more than a pass: 72 lift outcomes in all.
    const tally: Record<string, number> = {};
    for (const line of rows.flatMap((row) => row.now)) {
      const kind = line.split(" ")[2].replace(":", "");
      tally[kind] = (tally[kind] ?? 0) + 1;
    }
    expect(tally).toEqual({ passed: 44, t3Same: 23, missed: 4, t3Up: 1 });
  });

  it("for a scripted log with misses, a reset, partial and skipped lifts, load drops and home days", () => {
    const script: SessionOptions[] = [
      {},
      { t1: FAIL },
      { t2: FAIL, t3: { lastReps: 25 } },
      { t1: PARTIAL, t2: { drop: true } },
      { templateId: "A1", t1: FAIL },
      { templateId: "A1", t1: FAIL, t2: { sets: 0 } },
      { templateId: "A1", t1: FAIL, t2: FAIL },
      { templateId: "A1", t1: { sets: 0 }, t2: FAIL, t3: PARTIAL },
      { templateId: "A1", t2: FAIL, t3: { sets: 0 } },
      { location: "home" },
      { location: "home", t1: FAIL, t2: { drop: true, sets: 2 } },
      { t1: { lastReps: 9 }, t3: { lastReps: 30 } },
      { templateId: "B1", t2: FAIL },
      { templateId: "B1", t2: FAIL },
      { templateId: "B1", t2: FAIL },
      { templateId: "B1", t2: { reps: [0] } },
    ];
    const sim = startSim();
    for (const options of script) runSession(sim, options);
    const rows = compare(sim.workouts, rebuildDerived(rebuildInput(sim)));
    expect(rows).toHaveLength(script.length);
    for (const row of rows) expect(row.now, row.workoutId).toEqual(row.old);

    const kinds = new Set(rows.flatMap((row) => row.now.map((line) => line.split(" ")[2])));
    expect([...kinds].sort()).toEqual([
      "held:",
      "missed:",
      "notDone:",
      "partial:",
      "passed:",
      "reset:",
      "t3Same:",
      "t3Up:",
    ]);
  });
});
