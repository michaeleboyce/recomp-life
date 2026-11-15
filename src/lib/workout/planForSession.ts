// The plan of a workout in progress, rebuilt from the saved session. Pure: no React, no database.
import { anchorToPrescription, emptyLiftState } from "@/lib/rebuild";
import { buildWorkoutPlan, overridesFromSession } from "@/lib/workout/buildPlan";
import { applyPlanEdits } from "@/lib/workout/planEdits";
import type { WorkoutPlan } from "@/lib/workout/types";
import type { EquipmentProfile, LiftState, WorkoutSession, WorkoutTemplate } from "@/types";

/**
 * The plan of a workout in progress. A session that stored its prescription keeps
 * it: each program lift's weight, sets and reps come from `session.prescribed`, so
 * editing an earlier session or adjusting a weight mid-workout cannot change what is
 * on the bar. Home substitution, warm-ups and accessories are built as always. A
 * session without a stored prescription is planned from the current lift states.
 * The session's `planEdits` (changes made before starting) are applied last.
 */
export function planForSession(input: {
  session: WorkoutSession;
  template: WorkoutTemplate;
  liftStates: LiftState[];
  equipment: EquipmentProfile;
}): WorkoutPlan {
  const { session, template, equipment } = input;
  const prescribed = session.prescribed;

  let liftStates = input.liftStates;
  if (prescribed) {
    const byId = new Map(liftStates.map((state) => [state.exerciseId, state]));
    for (const entry of prescribed) {
      const state = byId.get(entry.exerciseId) ?? emptyLiftState(entry.exerciseId);
      byId.set(entry.exerciseId, anchorToPrescription(state, entry));
    }
    liftStates = [...byId.values()];
  }

  const plan = buildWorkoutPlan({
    template,
    liftStates,
    location: session.location,
    equipment,
    includeWarmUps: session.includeWarmUps,
    selectedAccessories: session.selectedAccessories ?? [],
    overrides: overridesFromSession(session),
  });
  const programPlan = prescribed
    ? plan.map((entry) => {
        if (entry.isWarmUp) return entry;
        const stored = prescribed.find(
          (p) => p.exerciseId === entry.exerciseId && p.tier === entry.tier
        );
        return stored ? { ...entry, targetSets: stored.sets, targetReps: stored.reps } : entry;
      })
    : plan;

  // The user's own changes come last, on top of what the program prescribed.
  return session.planEdits?.length ? applyPlanEdits(programPlan, session.planEdits) : programPlan;
}
