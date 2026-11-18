// The swap sheet's progression text against what the progression code really does: each
// case runs a session with the swap through the rebuild and the rotation fold, and the
// effect's fields (and so its words) must say what happened.
import { describe, it, expect } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { rebuildDerived } from "@/lib/rebuild";
import { PROGRESSION_FIELDS } from "@/lib/rebuild/testHelpers";
import { sessionCountsForRotation } from "@/lib/workout/credit";
import { createSetLog } from "@/lib/workout/logSet";
import { prescribedFor } from "@/lib/workout/planEdits";
import { planForSession } from "@/lib/workout/planForSession";
import { rehydratePlan } from "@/lib/workout/rehydrate";
import { fixtureStartAdjustments, makeSession, seedLiftStates } from "@/lib/workout/testFixtures";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { LiftState, PlanEdit, SetLog, Tier, WorkoutLocation, WorkoutSession } from "@/types";
import { swapEdits } from "./combos";
import { midWorkoutSwap } from "./midWorkout";
import { swapProgressionEffect } from "./progressionEffect";

const SETTINGS = DEFAULT_USER_PROFILE.settings;
const TEMPLATE = WORKOUT_TEMPLATES.A1;
const START = new Date(2026, 10, 18, 9, 0, 0);

const prescription = (sets: number, reps: number) => ({
  weight: 40,
  sets,
  reps,
  isAMRAP: false,
  basis: "history" as const,
  note: "",
});

/** Runs an A1 with one lift swapped (before the workout, or after `after` sets of it) and finishes it. */
function runSwapped(options: {
  liftId: string;
  tier: Tier;
  replacementId: string;
  location: WorkoutLocation;
  after?: number;
}) {
  const liftStates = seedLiftStates();
  const home = options.location === "home" ? { variantStates: [], equipment: SETTINGS.equipment } : undefined;
  let session: WorkoutSession = makeSession({
    templateId: "A1",
    location: options.location,
    startedAt: START,
    prescribed: prescribedFor(TEMPLATE, liftStates, home),
    planEdits: [],
  });
  const plan = () => planForSession({ session, template: TEMPLATE, liftStates, equipment: SETTINGS.equipment, variantStates: [] });
  const sets: SetLog[] = [];
  let clock = 0;
  const logAll = (only?: (id: string, tier: Tier) => boolean, limit = Infinity) => {
    for (const entry of rehydratePlan(plan(), sets).plan) {
      if (entry.isWarmUp || (only && !only(entry.exerciseId, entry.tier))) continue;
      for (let done = entry.completedSets; done < Math.min(entry.targetSets, limit); done++) {
        clock += 3;
        const d = new Date(START);
        d.setMinutes(d.getMinutes() + clock);
        const id = `set-${sets.length + 1}`;
        sets.push(
          createSetLog({
            exercise: { ...entry, completedSets: done },
            actualReps: entry.targetReps,
            rpe: null,
            location: options.location,
            autoRegulated: false,
            now: d,
            id,
            clientId: id,
          })
        );
      }
    }
  };
  const replacements = [{ exerciseId: options.replacementId, prescription: prescription(3, 10) }];
  let edits: PlanEdit[];
  if (options.after == null) {
    edits = swapEdits(options.liftId, options.tier, replacements);
  } else {
    logAll((id, tier) => id === options.liftId && tier === options.tier, options.after);
    edits = midWorkoutSwap({ plan: plan(), sets, exerciseId: options.liftId, tier: options.tier, replacements }).edits;
  }
  session = { ...session, planEdits: edits };
  logAll();
  const end = new Date(START);
  end.setHours(end.getHours() + 2);
  const finished: WorkoutSession = { ...session, sets, completedAt: end };
  const rebuilt = rebuildDerived({ workouts: [finished], adjustments: fixtureStartAdjustments(), settings: SETTINGS });
  return { liftStates, finished, rebuilt };
}

const fields = (s: LiftState | undefined) =>
  s && Object.fromEntries(PROGRESSION_FIELDS.filter((f) => f !== "recentE1RMs").map((f) => [f, s[f]]));

const CASES: { liftId: string; tier: Tier; replacementId: string; location: WorkoutLocation; after?: number }[] = [
  { liftId: "squat", tier: "T1", replacementId: "leg_press", location: "gym" },
  { liftId: "squat", tier: "T1", replacementId: "leg_press", location: "gym", after: 2 },
  { liftId: "squat", tier: "T1", replacementId: "goblet_squat", location: "home" },
  { liftId: "bench", tier: "T2", replacementId: "db_bench", location: "gym" },
  { liftId: "bench", tier: "T2", replacementId: "db_bench", location: "gym", after: 1 },
  { liftId: "bench", tier: "T2", replacementId: "db_floor_press", location: "home" },
  { liftId: "lat_pulldown", tier: "T3", replacementId: "db_row", location: "gym" },
  { liftId: "lat_pulldown", tier: "T3", replacementId: "db_row", location: "gym", after: 2 },
];

describe("swapProgressionEffect agrees with the progression code", () => {
  it.each(CASES)("$tier $liftId -> $replacementId at the $location, after $after sets", (c) => {
    const effect = swapProgressionEffect(c.tier, c.liftId, c.replacementId, { setsLogged: c.after ?? 0 });
    const { liftStates, finished, rebuilt } = runSwapped(c);

    const before = fields(liftStates.find((s) => s.exerciseId === c.liftId));
    const after = fields(rebuilt.liftStates.find((s) => s.exerciseId === c.liftId));
    expect(after).toBeDefined();
    // liftHeld: the lift's weight, stage, fail count and dates are exactly as before.
    expect(effect.liftHeld).toBe(true);
    expect(after).toEqual(before);
    const outcome = rebuilt.outcomes.get(finished.id)!.find((o) => o.exerciseId === c.liftId && o.tier === c.tier)!;
    expect(["notDone", "loggedOnly"]).toContain(outcome.kind);

    // replacementCounts: the exercise swapped in moves nothing of its own.
    expect(effect.replacementCounts).toBe(false);
    const variantOutcomes = rebuilt.variantOutcomes.get(finished.id) ?? [];
    expect(variantOutcomes.filter((o) => o.exerciseId === c.replacementId && o.liftId === c.liftId && o.tier === c.tier)).toEqual([]);
    expect(rebuilt.variantStates.filter((v) => v.exerciseId === c.replacementId && v.liftId === c.liftId && v.tier === c.tier)).toEqual([]);

    // dayStaysDue: the session does not move the rotation.
    expect(effect.dayStaysDue).toBe(!sessionCountsForRotation(finished, "A1"));

    // The words follow the fields.
    expect(effect.text.includes(`stays at its ${c.tier} weight and stage`)).toBe(effect.liftHeld);
    expect(effect.text.includes("This day stays due next time")).toBe(effect.dayStaysDue);
    expect(effect.text.includes("already done")).toBe((c.after ?? 0) > 0);
  });

  it("the untouched lifts of the same session still progress (the swap is per lift)", () => {
    const { liftStates, rebuilt } = runSwapped(CASES[3]);
    const squatBefore = liftStates.find((s) => s.exerciseId === "squat")!;
    const squatAfter = rebuilt.liftStates.find((s) => s.exerciseId === "squat")!;
    expect(squatAfter.t1Weight).toBeGreaterThan(squatBefore.t1Weight);
  });
});

describe("swapProgressionEffect words", () => {
  it("says a T1 swap keeps the day due", () => {
    expect(swapProgressionEffect("T1", "squat", "leg_press").text).toBe(
      "Barbell Squat stays at its T1 weight and stage: a swapped lift counts as neither a pass nor a miss. Leg Press is logged only. This day stays due next time."
    );
  });

  it("names the sets already done in a swap during the workout", () => {
    expect(swapProgressionEffect("T2", "bench", "db_bench", { setsLogged: 2 }).text).toMatch(
      /^The 2 sets of Barbell Bench Press already done are kept in the log\. /
    );
  });

  it("an accessory has no program progression; the same exercise changes nothing", () => {
    expect(swapProgressionEffect("accessory", "face_pulls", "reverse_fly")).toMatchObject({ kind: "accessory", liftHeld: false, dayStaysDue: false });
    expect(swapProgressionEffect("T1", "squat", "squat").kind).toBe("none");
  });
});
