"use client";

import { ExerciseImage, hasExercisePhoto } from "@/components/ui/exercise-image";
import { Stripes } from "@/components/ui/stripes";
import { WorkoutFigure } from "@/components/ui/workout-figure";
import { formatClock } from "@/components/ActiveWorkout/activeWorkoutLogic";
import { workoutDisplayName } from "@/lib/workoutNames";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { WorkoutSession } from "@/types";

/**
 * The top of the finished workout: "A1 complete · 47:12", the day's name, done, the
 * main lift's photo and the muscles the session worked.
 */
export function DoneHero({ workout }: { workout: WorkoutSession }) {
  const template = WORKOUT_TEMPLATES[workout.templateId];
  const lifts = [
    ...new Set(
      (workout.sets ?? [])
        .filter((set) => set.tier !== "warmup")
        .map((set) => set.substituteExerciseId || set.exerciseId)
    ),
  ];
  const main = template?.exercises.find((e) => e.tier === "T1")?.exerciseId;
  const length = workout.totalDurationSeconds > 0 ? ` · ${formatClock(workout.totalDurationSeconds)}` : "";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2.5">
      <div className="flex min-w-0 flex-col gap-2">
        <span className="font-display text-[12px] font-semibold tracking-[0.16em] text-accent-primary uppercase">
          {workout.templateId} complete{length}
        </span>
        <h1 className="font-display text-[34px] leading-[0.95] font-extrabold break-words uppercase">
          {workoutDisplayName(workout.templateId)}, done
        </h1>
        <Stripes />
      </div>
      <div className="relative h-[124px] w-[150px]">
        {main && hasExercisePhoto(main) && (
          <ExerciseImage exerciseId={main} variant="arch" className="absolute top-0 right-0 h-[124px] w-[84px]" />
        )}
        {lifts.length > 0 && (
          <span className="absolute bottom-0 left-0 rounded-xl bg-background px-1 pt-1">
            <WorkoutFigure exerciseIds={lifts} views={["back"]} className="h-24" />
          </span>
        )}
      </div>
    </div>
  );
}
