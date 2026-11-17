"use client";

import { useMemo } from "react";
import { useCompletedWorkouts, useE1RMs } from "@/hooks";
import { programLiftFor } from "@/components/Lift/homeVersion";
import { SessionList } from "@/components/Lift/SessionList";
import { liftSessions, type LiftSession } from "@/components/Lift/sessions";

const NONE: LiftSession[] = [];

/**
 * The exercise's sessions on its page: the logged ones (sets of the exercise itself,
 * and, for a home version, the program lift's sets done as it), then the imported
 * sessions whose sets count as this exercise, labelled and with a control to hide them.
 * Nothing when it has no history.
 */
export function ExerciseSessions({ exerciseId }: { exerciseId: string }) {
  const workouts = useCompletedWorkouts();
  const e1rms = useE1RMs();
  const parent = programLiftFor(exerciseId);

  const own = useMemo(() => {
    if (!workouts || !e1rms) return NONE;
    const direct = liftSessions(workouts, e1rms, exerciseId).filter((s) => s.substituteExerciseId === undefined);
    const asSubstitute = parent
      ? liftSessions(workouts, e1rms, parent).filter((s) => s.substituteExerciseId === exerciseId)
      : [];
    return [...direct, ...asSubstitute].sort((a, b) => b.t - a.t);
  }, [workouts, e1rms, exerciseId, parent]);

  return <SessionList sessions={own} homeOnly={Boolean(parent)} importedFor={[exerciseId]} />;
}
