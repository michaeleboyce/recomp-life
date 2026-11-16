// The plan of a workout in progress, rebuilt from the saved session. Pure: no React, no database.
import { anchorToPrescription, emptyLiftState } from "@/lib/rebuild";
import type { StrengthSet } from "@/lib/strength";
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
 * The home exercises' states with a session's stored home prescriptions laid on top
 * (rule 4 for home exercises): each prescribed home exercise takes its stored weight and
 * scheme and is the current one for its lift and tier. One never used is seeded first;
 * `seeds` says how, by variant id. The lift states should already be anchored.
 */
export function anchorHomePrescriptions(input: {
  variantStates: readonly VariantState[];
  session: Pick<WorkoutSession, "prescribed">;
  template: WorkoutTemplate;
  liftStates: readonly LiftState[];
  equipment: EquipmentProfile;
  strengthSets?: readonly StrengthSet[];
}): { variantStates: VariantState[]; seeds: Map<string, VariantState["seed"]> } {
  const { session, template, equipment, strengthSets } = input;
  const byId = new Map(input.liftStates.map((state) => [state.exerciseId, state]));
  const variants = new Map(input.variantStates.map((v) => [v.id, v]));
  const seeds = new Map<string, VariantState["seed"]>();
  for (const entry of session.prescribed ?? []) {
    if (!entry.home || !isVariantTier(entry.tier)) continue;
    const tier = entry.tier;
    const id = variantKey(entry.exerciseId, entry.home.exerciseId, tier);
    const stored = variants.get(id);
    const going =
      stored ??
      seedVariantState({
        liftId: entry.exerciseId,
        exerciseId: entry.home.exerciseId,
        tier,
        liftState: byId.get(entry.exerciseId),
        equipment,
        ...(strengthSets ? { strengthSets } : {}),
      });
    if (!stored) seeds.set(id, going.seed);
    for (const other of variants.values()) {
      if (other.liftId === entry.exerciseId && other.tier === tier && other.id !== id) {
        variants.set(other.id, { ...other, current: false });
      }
    }
    const slot = template.exercises.find((ex) => ex.exerciseId === entry.exerciseId && ex.tier === tier);
    variants.set(id, {
      ...anchorVariant(going, entry.home, slot ? { sets: slot.sets, reps: slot.reps } : undefined),
      current: true,
    });
  }
  return { variantStates: [...variants.values()], seeds };
}

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
  /** The home exercises' states; leave out to plan home lifts from their seeds alone. */
  variantStates?: VariantState[];
  /** Every logged set as strength evidence, for seeding a home exercise never used (H3). */
  strengthSets?: readonly StrengthSet[];
}): WorkoutPlan {
  const { session, template, equipment, strengthSets } = input;
  const prescribed = session.prescribed;

  let liftStates = input.liftStates;
  let variantStates = input.variantStates ?? [];
  /** Seeds of the home exercises this session does for the first time, by variant id. */
  const seeds = new Map<string, VariantState["seed"]>();
  if (prescribed) {
    const byId = new Map(liftStates.map((state) => [state.exerciseId, state]));
    for (const entry of prescribed) {
      const state = byId.get(entry.exerciseId) ?? emptyLiftState(entry.exerciseId);
      byId.set(entry.exerciseId, anchorToPrescription(state, entry));
    }
    liftStates = [...byId.values()];
    const anchored = anchorHomePrescriptions({
      variantStates,
      session,
      template,
      liftStates,
      equipment,
      ...(strengthSets ? { strengthSets } : {}),
    });
    variantStates = anchored.variantStates;
    for (const [id, seed] of anchored.seeds) seeds.set(id, seed);
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
    ...(strengthSets ? { strengthSets } : {}),
  });
  const programPlan = prescribed
    ? plan.map((planned) => {
        if (planned.isWarmUp) return planned;
        // A home exercise first done in this session keeps the note of how it was seeded.
        const seed = planned.variantId ? seeds.get(planned.variantId) : undefined;
        const entry = seed ? { ...planned, seed } : planned;
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
