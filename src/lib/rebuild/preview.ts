import { getPrescription } from "@/lib/workout/prescription";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { Estimated1RM, LiftState, WorkoutTemplateExercise } from "@/types";
import { applyChange } from "./change";
import { rebuildDerived } from "./fold";
import type {
  ChangePreview,
  LogChange,
  NextWorkoutChange,
  PrChange,
  RebuildInput,
  RebuildResult,
  TierPrescription,
} from "./types";

type ProgramTier = NextWorkoutChange["tier"];
const TIER_ORDER: readonly ProgramTier[] = ["T1", "T2", "T3"];

/** Every (lift, tier) the program prescribes, once each, by exerciseId then tier. */
function programSlots(): WorkoutTemplateExercise[] {
  const slots = new Map<string, WorkoutTemplateExercise>();
  for (const template of Object.values(WORKOUT_TEMPLATES)) {
    for (const ex of template.exercises) {
      if (!TIER_ORDER.includes(ex.tier as ProgramTier)) continue;
      const key = `${ex.exerciseId}:${ex.tier}`;
      if (!slots.has(key)) slots.set(key, ex);
    }
  }
  return [...slots.values()].sort(
    (a, b) =>
      (a.exerciseId < b.exerciseId ? -1 : a.exerciseId > b.exerciseId ? 1 : 0) ||
      TIER_ORDER.indexOf(a.tier as ProgramTier) - TIER_ORDER.indexOf(b.tier as ProgramTier)
  );
}

/** What the next session of this lift at this tier would be given, from its state. */
export function tierPrescription(
  slot: WorkoutTemplateExercise,
  state: LiftState | undefined
): TierPrescription {
  const { weight, sets, reps } = getPrescription(slot, state);
  const stage =
    slot.tier === "T1" ? state?.t1Stage : slot.tier === "T2" ? state?.t2Stage : undefined;
  return stage ? { weight, stage, sets, reps } : { weight, sets, reps };
}

function samePrescription(a: TierPrescription, b: TierPrescription): boolean {
  return a.weight === b.weight && a.stage === b.stage && a.sets === b.sets && a.reps === b.reps;
}

function bestByExercise(rows: Estimated1RM[]): Map<string, number> {
  const best = new Map<string, number>();
  for (const row of rows) {
    const current = best.get(row.exerciseId);
    if (current === undefined || row.estimated1RM > current) {
      best.set(row.exerciseId, row.estimated1RM);
    }
  }
  return best;
}

/** The differences between two rebuilds, in the shape the edit sheet shows. */
export function compareRebuilds(
  before: Pick<RebuildResult, "liftStates" | "e1rms">,
  after: Pick<RebuildResult, "liftStates" | "e1rms">
): ChangePreview {
  const statesBefore = new Map(before.liftStates.map((ls) => [ls.exerciseId, ls]));
  const statesAfter = new Map(after.liftStates.map((ls) => [ls.exerciseId, ls]));

  const nextWorkout: NextWorkoutChange[] = [];
  for (const slot of programSlots()) {
    const was = tierPrescription(slot, statesBefore.get(slot.exerciseId));
    const now = tierPrescription(slot, statesAfter.get(slot.exerciseId));
    if (!samePrescription(was, now)) {
      nextWorkout.push({
        exerciseId: slot.exerciseId,
        tier: slot.tier as ProgramTier,
        before: was,
        after: now,
      });
    }
  }

  const bestBefore = bestByExercise(before.e1rms);
  const bestAfter = bestByExercise(after.e1rms);
  const prChanges: PrChange[] = [...new Set([...bestBefore.keys(), ...bestAfter.keys()])]
    .sort()
    .map((exerciseId) => ({
      exerciseId,
      before: bestBefore.get(exerciseId) ?? null,
      after: bestAfter.get(exerciseId) ?? null,
    }))
    .filter((change) => change.before !== change.after);

  const valuesBefore = new Map(before.e1rms.map((row) => [row.id, row.estimated1RM]));
  const valuesAfter = new Map(after.e1rms.map((row) => [row.id, row.estimated1RM]));
  let e1rmChanges = 0;
  for (const [id, value] of valuesAfter) {
    if (valuesBefore.get(id) !== value) e1rmChanges += 1; // added or changed
  }
  for (const id of valuesBefore.keys()) {
    if (!valuesAfter.has(id)) e1rmChanges += 1; // removed
  }

  return {
    nextWorkout,
    prChanges,
    e1rmChanges,
    unaffected: nextWorkout.length === 0 && prChanges.length === 0 && e1rmChanges === 0,
  };
}

/**
 * What a change would do to the next workout, PRs and e1RM history, without saving
 * it. `at` is passed through to `applyChange`.
 */
export function previewLogChange(
  input: RebuildInput,
  change: LogChange,
  at: number = 0
): ChangePreview {
  const before = rebuildDerived(input);
  const changed = applyChange(
    { workouts: input.workouts, adjustments: input.adjustments },
    change,
    at
  );
  const after = rebuildDerived({ ...input, ...changed });
  return compareRebuilds(before, after);
}
