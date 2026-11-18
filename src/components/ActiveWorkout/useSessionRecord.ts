"use client";

import { useCallback, useMemo, useState } from "react";
import type { StrengthSet } from "@/lib/strength";
import { appendPlanEdit } from "@/lib/data/workouts";
import type { MidWorkoutChange } from "@/lib/swap";
import { applyPlanEdits, type WorkoutPlan } from "@/lib/workout";
import { planForSession } from "@/lib/workout/planForSession";
import type { LiftState, PlanEdit, UserSettings, VariantState, WorkoutSession, WorkoutTemplate } from "@/types";

/**
 * The saved session, the record of what happened: its logged sets, its start time and
 * its plan edits. Nothing on the screen keeps its own copy of these, with one deliberate
 * exception, the frozen plan:
 *
 * The plan as prescribed when the workout started (its stored prescription, home
 * exercises' included; the current lift and home-exercise states only for a session
 * that has none), planned once per session so that saving the workout (which moves the
 * states) cannot reshuffle it; so it waits for every state it reads. A plan edit made
 * during the workout is appended to the session first (`appendPlanEdit`, in order) and
 * then laid on this plan here (an add) or the plan the change returns set as it (a swap
 * or removal), so no entry moves and a reload plans the same from the session.
 */
export function useSessionRecord(
  session: WorkoutSession | null | undefined,
  inputs: {
    settings: UserSettings | null | undefined;
    liftStates: LiftState[] | undefined;
    variantStates: VariantState[] | undefined;
    strengthSets: StrengthSet[] | undefined;
    template: WorkoutTemplate | undefined;
  }
) {
  const { settings, liftStates, variantStates, strengthSets, template } = inputs;
  const [frozen, setFrozen] = useState<{ sessionId: string; plan: WorkoutPlan } | null>(null);
  if (
    session &&
    settings &&
    liftStates &&
    variantStates &&
    strengthSets &&
    template &&
    frozen?.sessionId !== session.id
  ) {
    setFrozen({
      sessionId: session.id,
      plan: planForSession({
        session,
        template,
        liftStates,
        equipment: settings.equipment,
        variantStates,
        strengthSets,
      }),
    });
  }
  const basePlan = session && frozen?.sessionId === session.id ? frozen.plan : null;

  // The start time is written once, when the workout starts (`startWorkout`), and never
  // changed. One Date per value, so the clock is not restarted.
  const startedAtMs = session ? new Date(session.startedAt).getTime() : null;
  const workoutStartTime = useMemo(() => (startedAtMs == null ? null : new Date(startedAtMs)), [startedAtMs]);

  const sets = useMemo(() => session?.sets ?? [], [session]);

  /** Saves an `add` edit on the workout `sessionId`, then puts its entry on the end of the frozen plan. */
  const saveAdd = useCallback(async (sessionId: string, edit: PlanEdit) => {
    await appendPlanEdit(sessionId, edit);
    setFrozen((was) =>
      was && was.sessionId === sessionId ? { sessionId: was.sessionId, plan: applyPlanEdits(was.plan, [edit]) } : was
    );
  }, []);

  /** Saves a swap's or removal's edits on the workout `sessionId` in order, then sets the frozen plan to the change's. */
  const saveChange = useCallback(async (sessionId: string, change: MidWorkoutChange) => {
    for (const edit of change.edits) await appendPlanEdit(sessionId, edit);
    setFrozen((was) => (was && was.sessionId === sessionId ? { sessionId: was.sessionId, plan: change.plan } : was));
  }, []);

  return {
    /** The frozen plan (no sets counted); null until it is planned. */
    basePlan,
    sets,
    workoutStartTime,
    saveAdd,
    saveChange,
  };
}
