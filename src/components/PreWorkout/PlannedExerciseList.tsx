"use client";

import { TierBadge } from "@/components/ui/tier-badge";
import { TierKey } from "@/components/Upcoming/TierKey";
import { getExercise } from "@/lib/exercises";
import { formatRestDuration, getRestSeconds } from "@/lib/restTimes";
import type { WorkoutExerciseState, WorkoutPlan } from "@/lib/workout/types";
import type { TrainingPhase } from "@/types";

interface PlannedExerciseListProps {
  /** The plan from `buildWorkoutPlan`: the same one the active workout performs. */
  plan: WorkoutPlan;
  /** Sets the rest shown after each exercise's sets (longer for heavy tiers while cutting). */
  trainingPhase?: TrainingPhase;
}

interface Row {
  entry: WorkoutExerciseState;
  warmUps: WorkoutExerciseState[];
}

/** Working entries, each with the warm-up entries that lead into it. */
function toRows(plan: WorkoutPlan): Row[] {
  const rows: Row[] = [];
  let warmUps: WorkoutExerciseState[] = [];
  for (const entry of plan) {
    if (entry.isWarmUp) {
      warmUps.push(entry);
    } else {
      rows.push({ entry, warmUps });
      warmUps = [];
    }
  }
  return rows;
}

function weightLabel(entry: WorkoutExerciseState): string {
  const info = getExercise(entry.substituteExerciseId || entry.exerciseId);
  return info.grip === "per_hand" ? `${entry.weight} lbs/hand` : `${entry.weight} lbs`;
}

/**
 * The workout exactly as it will be performed: tier, exercise, weight, sets x reps,
 * and the rest the timer will run after each of its sets.
 */
export function PlannedExerciseList({ plan, trainingPhase }: PlannedExerciseListProps) {
  const hasWarmUps = plan.some((entry) => entry.isWarmUp);
  return (
    <div className="flex flex-col gap-1.5">
      <TierKey warmUp={hasWarmUps} rest />
      <ul className="divide-y divide-border" aria-label="Exercises">
        {toRows(plan).map(({ entry, warmUps }, index) => {
          const info = getExercise(entry.substituteExerciseId || entry.exerciseId);
          const original = entry.substituteExerciseId ? getExercise(entry.exerciseId) : null;
          const rest = formatRestDuration(getRestSeconds(entry.tier, trainingPhase));
          return (
            <li
              key={`${entry.exerciseId}-${entry.tier}-${index}`}
              data-testid="planned-exercise"
              className="flex items-center gap-3 py-2.5"
            >
              <TierBadge tier={entry.tier} variant="soft" className="w-10 rounded-md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{info.name}</p>
                {original && (
                  <p className="truncate text-xs text-muted-foreground">
                    in place of {original.name}
                    {entry.originalWeight ? ` at ${entry.originalWeight} lbs` : ""}
                  </p>
                )}
                {warmUps.length > 0 && (
                  <p className="truncate font-mono text-xs tabular-nums text-muted-foreground">
                    warm-up: {warmUps.map((w) => `${w.weight}×${w.targetReps}`).join(" · ")}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right font-mono tabular-nums">
                <p className="text-sm font-semibold">{weightLabel(entry)}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.targetSets}
                  {"×"}
                  {entry.targetReps}
                  {entry.isAMRAP ? "+" : ""}
                  <span data-testid="planned-rest"> · rest {rest}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
