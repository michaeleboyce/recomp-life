"use client";

import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import { v4 as uuidv4 } from "uuid";
import { appendSet } from "@/lib/data/workouts";
import type { WorkoutExerciseState, WorkoutPlan } from "@/lib/workout";
import type { EquipmentProfile, SetLog, TrainingPhase, WorkoutSession } from "@/types";
import { entryIndexForSet } from "./activeWorkoutLogic";
import { restsAfterDrops, restTimer } from "./restCountdown";
import { attachDrops, buildDropSet, dropSetWeight, minWeightFor, weightStepFor } from "./setPlan";
import type { useSetDraft } from "./useSetDraft";
import type { useTapGuard } from "./useTapGuard";

/** The exercise a set was done with: the substitute when there was one. */
const performedId = (set: Pick<SetLog, "exerciseId" | "substituteExerciseId">) =>
  set.substituteExerciseId || set.exerciseId;

type Draft = ReturnType<typeof useSetDraft>;

/**
 * Drop sets: going on from the latest set at a lighter weight with no rest. The next
 * drop's weight and reps are the draft's (`useSetDraft`); each drop logged is a row
 * on the workout with role "drop" continuing the set before it.
 */
export function useDropSets(input: {
  session: WorkoutSession | null | undefined;
  sets: SetLog[];
  plan: WorkoutPlan;
  equipment: EquipmentProfile | undefined;
  isSaving: boolean;
  endedEarly: boolean;
  trainingPhase: TrainingPhase;
  guard: ReturnType<typeof useTapGuard>;
  draft: Pick<Draft, "drop" | "startDrop" | "continueDrop" | "setDropWeightAtLeast" | "setDropReps" | "endDrop">;
  setAwaitingSetId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  clearFlash: () => void;
}) {
  const { session, sets, plan, equipment, isSaving, endedEarly, trainingPhase, guard, setAwaitingSetId, setError, clearFlash } =
    input;
  const { drop: activeDrop, startDrop, continueDrop, setDropWeightAtLeast, setDropReps, endDrop } = input.draft;

  // The set a drop would continue: the latest set logged, when it is not a warm-up.
  const latestSet = sets.at(-1);
  const dropFrom = latestSet && latestSet.tier !== "warmup" ? latestSet : null;
  const dropStart =
    dropFrom && equipment
      ? dropSetWeight(dropFrom.weight, performedId(dropFrom), dropFrom.location, equipment)
      : null;
  /** The weight a drop after the latest set starts at; null when no lighter drop is possible. */
  const dropPreview =
    dropFrom && dropStart != null && dropStart < dropFrom.weight ? dropStart : null;

  const dropSet = useMemo(() => {
    if (!activeDrop || !equipment) return null;
    const chain = attachDrops(sets).find((row) => row.set.id === activeDrop.rootId);
    if (!chain) return null;
    const root = chain.set;
    const planned = plan[entryIndexForSet(plan, root)];
    const exercise: WorkoutExerciseState = {
      exerciseId: root.exerciseId,
      ...(root.substituteExerciseId ? { substituteExerciseId: root.substituteExerciseId } : {}),
      tier: root.tier,
      targetSets: 1,
      targetReps: activeDrop.reps,
      weight: activeDrop.weight,
      ...(planned?.originalWeight != null ? { originalWeight: planned.originalWeight } : {}),
      isAMRAP: false,
      isWarmUp: false,
      completedSets: 0,
    };
    return {
      /** The set the drops continue, and the drops logged after it so far. */
      root,
      drops: chain.drops,
      weight: activeDrop.weight,
      reps: activeDrop.reps,
      suggestedReps: activeDrop.suggestedReps,
      /** The drop as an entry, for the weight display. */
      exercise,
      step: weightStepFor(performedId(root), root.location, equipment),
      minWeight: minWeightFor(performedId(root), root.location, equipment),
    };
  }, [activeDrop, equipment, sets, plan]);

  /**
   * Goes on from the latest set at a lighter weight (`dropPreview`): the rest stops and
   * the drop is set up, to be adjusted and logged.
   */
  const startDropSet = useCallback(() => {
    if (!session || !dropFrom || dropPreview == null) return;
    if (guard.tooSoon()) return;
    guard.mark();
    restTimer.skip();
    clearFlash();
    const rootId =
      dropFrom.role === "drop"
        ? (attachDrops(sets).find((row) => row.drops.some((d) => d.id === dropFrom.id))?.set.id ??
          dropFrom.id)
        : dropFrom.id;
    const reps = dropFrom.actualReps > 0 ? dropFrom.actualReps : dropFrom.targetReps;
    startDrop(rootId, dropFrom.id, dropPreview, reps);
  }, [session, dropFrom, dropPreview, guard, sets, clearFlash, startDrop]);

  const minDropWeight = dropSet?.minWeight;
  const setDropWeight = useCallback(
    (weight: number) => setDropWeightAtLeast(minDropWeight ?? 0, weight),
    [minDropWeight, setDropWeightAtLeast]
  );

  /**
   * Logs the drop: a row with role "drop" continuing the set before it. No rest starts;
   * the next drop is set up from this one, about as much lighter again.
   */
  const logDropSet = useCallback(async () => {
    if (!session || !activeDrop || !equipment || isSaving) return;
    if (guard.tooSoon()) return;
    const parent = sets.find((set) => set.id === activeDrop.parentId);
    if (!parent) return;
    guard.mark();
    setError(null);

    const drop = buildDropSet({
      parent,
      weight: activeDrop.weight,
      actualReps: activeDrop.reps,
      repsInReserve: null,
      now: new Date(),
      id: uuidv4(),
      clientId: uuidv4(),
    });
    setAwaitingSetId(drop.id);
    try {
      await appendSet(session.id, drop);
    } catch (err) {
      console.error("Failed to save drop set:", err);
      setAwaitingSetId(null);
      guard.release();
      setError("That drop could not be saved. Try again.");
      return;
    }
    const next = dropSetWeight(drop.weight, performedId(drop), drop.location, equipment);
    const reps = drop.actualReps > 0 ? drop.actualReps : activeDrop.reps;
    continueDrop(activeDrop, drop.id, next, reps);
  }, [session, activeDrop, equipment, isSaving, guard, sets, setError, setAwaitingSetId, continueDrop]);

  /** No more drops: the rest that follows the set starts, when anything is left to do. */
  const endDropSets = useCallback(() => {
    if (!activeDrop) return;
    guard.mark();
    const root = sets.find((set) => set.id === activeDrop.rootId);
    endDrop();
    if (root && restsAfterDrops(root.tier, endedEarly, plan)) restTimer.start(root.tier, trainingPhase);
  }, [activeDrop, guard, sets, endDrop, endedEarly, plan, trainingPhase]);

  return { dropPreview, dropSet, startDropSet, setDropWeight, setDropReps, logDropSet, endDropSets };
}
