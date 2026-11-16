// The outcome reported by the progression code says the same thing as the old
// description did. That one worked out what happened afterwards, by comparing lift
// states before and after a session (src/components/Log/outcomes.ts until 2026-11-14).
// Before it was deleted, this test ran both side by side and they agreed on every line;
// the old lines were then recorded in __fixtures__/old-outcome-lines.json, so the
// comparison still runs. Do not regenerate the file: a difference means the outcome
// for an ordinary session has changed.
//
// Regenerated on purpose on 2026-11-15 for the strength model: a lift done as a home
// exercise is now "held" (its barbell weight does not move at home; the home exercise
// progresses instead), and the demo log has a home block. Every gym line of the
// scripted log that changed did so only because the home sessions before it no longer
// raised or lowered the barbell weight. The demo lines were regenerated on purpose again
// on 2026-11-16: the demo now plans as the Ready screen does, so its first gym session
// of each lift after the home block takes the re-entry weight (H6) and every later gym
// weight follows from that. The scripted lines did not change.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
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
import type { WorkoutSession } from "@/types";
import { describeOutcomes } from "./outcomes";

const OLD_LINES = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "__fixtures__/old-outcome-lines.json"), "utf8")
) as { demo: Record<string, string[]>; scripted: Record<string, string[]> };

/** The old kind names, where they differ from the outcome type's. */
const OLD_KIND: Record<string, string> = { stageDown: "missed" };

/** Misses down to a reset, partial and skipped lifts, load drops and home days. */
const SCRIPT: SessionOptions[] = [
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

/** One line per lift of each workout, written with the old kind names. */
function lines(
  workouts: WorkoutSession[],
  rebuilt: ReturnType<typeof rebuildDerived>
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const workout of workouts) {
    out[workout.id] = describeOutcomes(workout, rebuilt.outcomes.get(workout.id)).map(
      (o) => `${o.exerciseId} ${o.tier} ${OLD_KIND[o.kind] ?? o.kind}: ${o.text}`
    );
  }
  return out;
}

function tally(rows: Record<string, string[]>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const line of Object.values(rows).flat()) {
    const kind = line.split(" ")[2].replace(":", "");
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

describe("outcome kind and text equal the old description", () => {
  it("for every demo workout", () => {
    const data = generateDemoData(new Date(2026, 10, 14, 12, 0, 0));
    const rebuilt = rebuildDerived({
      workouts: data.workouts,
      adjustments: data.liftAdjustments,
      settings: DEFAULT_USER_PROFILE.settings,
    });
    const now = lines(data.workouts, rebuilt);
    expect(Object.keys(now)).toHaveLength(24);
    for (const workout of data.workouts) {
      expect(now[workout.id], workout.id).toHaveLength(3);
      expect(now[workout.id], workout.id).toEqual(OLD_LINES.demo[workout.id]);
    }
    // The demo log exercises more than a pass: 72 lift outcomes in all. Since 2026-11-15
    // the eight home sessions hold their 20 substituted lifts (the home exercises
    // progress instead), and the dumbbell row, done as itself at home, still progresses.
    expect(tally(now)).toEqual({ passed: 29, held: 20, t3Same: 19, missed: 3, t3Up: 1 });
  });

  it("for a scripted log with misses, a reset, partial and skipped lifts, load drops and home days", () => {
    const sim = startSim();
    for (const options of SCRIPT) runSession(sim, options);
    const now = lines(sim.workouts, rebuildDerived(rebuildInput(sim)));
    expect(Object.keys(now)).toHaveLength(SCRIPT.length);
    for (const workout of sim.workouts) {
      expect(now[workout.id], workout.id).toEqual(OLD_LINES.scripted[workout.id]);
    }
    expect(Object.keys(tally(now)).sort()).toEqual([
      "held",
      "missed",
      "notDone",
      "partial",
      "passed",
      "reset",
      "t3Same",
      "t3Up",
    ]);
  });
});
