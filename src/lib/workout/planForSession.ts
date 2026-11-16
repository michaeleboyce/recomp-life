// The plan of a workout in progress, rebuilt from the saved session. Pure: no React, no database.
import { anchorToPrescription, emptyLiftState } from "@/lib/rebuild";
import { buildWorkoutPlan, overridesFromSession } from "@/lib/workout/buildPlan";
import { applyPlanEdits } from "@/lib/workout/planEdits";
import type { WorkoutPlan } from "@/lib/workout/types";
import { anchorVariant, isVariantTier, seedVariantState, variantKey } from "@/lib/workout/variant";
import type {
  EquipmentProfile,
  LiftState,
  VariantState,
  WorkoutSession,
  WorkoutTemplate,
} from "@/types";

/**
 * The plan of a workout in progress. A session that stored its prescription keeps
 * it: each program lift's weight, sets and reps come from `session.prescribed`, so
 * editing an earlier session or adjusting a weight mid-workout cannot change what is
 * on the bar. At home a lift is planned as its home exercise from `variantStates`; a
 * stored home prescription (`PrescribedEntry.home`) fixes that exercise, its weight and
 * its scheme the same way. Warm-ups and accessories are built as always. A session
 * without a stored prescription is planned from the current states. The session's
 * `planEdits` (changes made before starting) are applied last.
 */
export function planForSession(input: {
  session: WorkoutSession;
  template: WorkoutTemplate;
  liftStates: LiftState[];
  equipment: EquipmentProfile;
  /** The home exercises' states; leave out to plan home lifts from today's conversion. */
  variantStates?: VariantState[];
}): WorkoutPlan {
  const { session, template, equipment } = input;
  const prescribed = session.prescribed;

  let liftStates = input.liftStates;
  let variantStates = input.variantStates ?? [];
  if (prescribed) {
    const byId = new Map(liftStates.map((state) => [state.exerciseId, state]));
    for (const entry of prescribed) {
      const state = byId.get(entry.exerciseId) ?? emptyLiftState(entry.exerciseId);
      byId.set(entry.exerciseId, anchorToPrescription(state, entry));
    }
    liftStates = [...byId.values()];

    const variants = new Map(variantStates.map((v) => [v.id, v]));
    for (const entry of prescribed) {
      if (!entry.home || !isVariantTier(entry.tier)) continue;
      const tier = entry.tier;
      const id = variantKey(entry.exerciseId, entry.home.exerciseId, tier);
      const going =
        variants.get(id) ??
        seedVariantState({
          liftId: entry.exerciseId,
          exerciseId: entry.home.exerciseId,
          tier,
          liftState: byId.get(entry.exerciseId),
          equipment,
        });
      for (const other of variants.values()) {
        if (other.liftId === entry.exerciseId && other.tier === tier && other.id !== id) {
          variants.set(other.id, { ...other, current: false });
        }
      }
      const slot = template.exercises.find(
        (ex) => ex.exerciseId === entry.exerciseId && ex.tier === tier
      );
      variants.set(id, {
        ...anchorVariant(going, entry.home, slot ? { sets: slot.sets, reps: slot.reps } : undefined),
        current: true,
      });
    }
    variantStates = [...variants.values()];
  }

  const plan = buildWorkoutPlan({
    template,
    liftStates,
    location: session.location,
    equipment,
    includeWarmUps: session.includeWarmUps,
    selectedAccessories: session.selectedAccessories ?? [],
    overrides: overridesFromSession(session),
    variantStates,
  });
  const programPlan = prescribed
    ? plan.map((entry) => {
        if (entry.isWarmUp) return entry;
        const stored = prescribed.find(
          (p) => p.exerciseId === entry.exerciseId && p.tier === entry.tier
        );
        if (!stored) return entry;
        // A home exercise has its own scheme: the stored home one, else the variant's.
        if (entry.substituteExerciseId) {
          return stored.home?.exerciseId === entry.substituteExerciseId
            ? { ...entry, targetSets: stored.home.sets, targetReps: stored.home.reps }
            : entry;
        }
        return { ...entry, targetSets: stored.sets, targetReps: stored.reps };
      })
    : plan;

  // The user's own changes come last, on top of what the program prescribed.
  return session.planEdits?.length ? applyPlanEdits(programPlan, session.planEdits) : programPlan;
}
