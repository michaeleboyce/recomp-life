// The plan of a workout in progress, rebuilt from the saved session. Pure: no React, no database.
import type { StrengthSet } from "@/lib/strength";
import { applyPlanEdits } from "@/lib/workout/planEdits";
import { planFromLifts } from "@/lib/workout/liftResolution";
import { resolveSavedSession } from "@/lib/workout/savedSession";
import type { WorkoutPlan } from "@/lib/workout/types";
import type {
  EquipmentProfile,
  LiftState,
  VariantSeed,
  VariantState,
  WorkoutSession,
  WorkoutTemplate,
} from "@/types";

/**
 * The home exercises' states with a session's stored home prescriptions laid on top
 * (rule 4 for home exercises): each prescribed home exercise takes its stored weight and
 * scheme and is the current one for its lift and tier. One never used is seeded first;
 * `seeds` says how, by variant id. The lift states should already be anchored. The same
 * reading of the session as resume and the rebuild (`resolveSavedSession`).
 */
export function anchorHomePrescriptions(input: {
  variantStates: readonly VariantState[];
  session: Pick<WorkoutSession, "prescribed">;
  template: WorkoutTemplate;
  liftStates: readonly LiftState[];
  equipment: EquipmentProfile;
  strengthSets?: readonly StrengthSet[];
}): { variantStates: VariantState[]; seeds: Map<string, VariantSeed> } {
  // The lift states are anchored already; anchoring them again changes nothing.
  const { variantStates, seeds } = resolveSavedSession({
    ...input,
    session: { prescribed: input.session.prescribed, location: "home", modifications: [] },
  });
  return { variantStates, seeds };
}

/**
 * The plan of a workout in progress, as the saved session has it
 * (`resolveSavedSession`): a session that stored its prescription keeps it, each program
 * lift's exercise, weight, sets and reps as recorded, so editing an earlier session,
 * adjusting a weight mid-workout or changing the equipment cannot change what is on the
 * bar or in the hands. Warm-ups and accessories are built as always. A session without a
 * stored prescription is planned from the current states. The session's `planEdits`
 * (set plans and changes made before starting) are applied last.
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
  const { lifts } = resolveSavedSession({
    session,
    template,
    liftStates: input.liftStates,
    variantStates: input.variantStates ?? [],
    equipment,
    ...(strengthSets ? { strengthSets } : {}),
  });
  const plan = planFromLifts(lifts, {
    location: session.location,
    equipment,
    includeWarmUps: session.includeWarmUps,
    selectedAccessories: session.selectedAccessories ?? [],
  });
  // The user's own changes come last, on top of what the program prescribed.
  return session.planEdits?.length ? applyPlanEdits(plan, session.planEdits) : plan;
}
