"use client";

import Link from "next/link";
import { templateTitle } from "@/components/ActiveWorkout/templateTitle";
import { ExerciseImage, hasExercisePhoto } from "@/components/ui/exercise-image";
import { WorkoutFigure } from "@/components/ui/workout-figure";
import { EYEBROW } from "@/components/Today/TodayHero";
import { estimateWorkoutMinutes, formatLbs } from "@/components/Today/format";
import { dayName, displayLiftName, photoPosition } from "@/components/Today/todayModel";
import { getExercise } from "@/lib/exercises";
import { tierStyle } from "@/lib/tierStyle";
import { cn } from "@/lib/utils";
import type { UpcomingEntry, UpcomingWorkout } from "@/lib/workout/upcoming";
import type { TrainingPhase } from "@/types";

function WeightLabel({ entry }: { entry: UpcomingEntry }) {
  if (entry.weight <= 0) return <>BW</>;
  const perHand = getExercise(entry.substituteExerciseId || entry.exerciseId).grip === "per_hand";
  return (
    <>
      {formatLbs(entry.weight)}
      {perHand && <span className="sr-only"> lbs per hand</span>}
    </>
  );
}

function EntryRow({ entry }: { entry: UpcomingEntry }) {
  const shownId = entry.substituteExerciseId || entry.exerciseId;
  const style = tierStyle(entry.tier);
  return (
    <li
      data-testid="upcoming-exercise"
      data-assumed={entry.assumed || undefined}
      className="flex items-baseline gap-1.5 text-xs leading-tight font-semibold text-foreground"
    >
      <span className={cn("w-4 shrink-0 font-mono text-[10px] font-bold", style.text)}>{style.label}</span>
      <span className="min-w-0 truncate">
        {displayLiftName(shownId)}
        {entry.substituteExerciseId && (
          <span className="sr-only"> in place of {displayLiftName(entry.exerciseId)}</span>
        )}
      </span>
      <b className="ml-auto font-display text-[19px] leading-none font-extrabold tabular-nums">
        <WeightLabel entry={entry} />
      </b>
      <span className="w-[38px] shrink-0 text-right font-mono text-[10px] font-normal text-muted-foreground">
        {entry.sets}×{entry.reps}
        {entry.isAMRAP ? "+" : ""}
      </span>
    </li>
  );
}

/** Position in the sequence; deliberately not a date. */
function sequenceLabel(index: number): string {
  return index === 0 ? "Next" : "Then";
}

/**
 * One upcoming workout as a photo card: a photo of its main lift behind a fade, its
 * place in the sequence, code and length, the name, the three lifts with their
 * projected weights and the muscles it works. The next one is outlined and opens
 * the start screen.
 */
export function UpcomingWorkoutCard({
  workout,
  index,
  phase,
}: {
  workout: UpcomingWorkout;
  index: number;
  phase?: TrainingPhase;
}) {
  const isNext = index === 0;
  const t1 = workout.entries.find((e) => e.tier === "T1");
  const photoId = t1 ? t1.substituteExerciseId || t1.exerciseId : undefined;
  const photo = photoId && hasExercisePhoto(photoId) ? photoId : null;
  const name = dayName(workout.template.exercises.find((e) => e.tier === "T1")?.exerciseId, templateTitle(workout.templateId));
  const minutes = estimateWorkoutMinutes(workout.plan, phase);
  const figureIds = workout.entries.map((e) => e.substituteExerciseId || e.exerciseId);
  const headingId = `upcoming-${index}-title`;

  return (
    <article
      aria-labelledby={headingId}
      data-testid="upcoming-workout"
      data-next={isNext || undefined}
      className="relative h-[146px] shrink-0 overflow-hidden rounded-[18px] bg-card"
    >
      {photo && (
        <>
          <ExerciseImage
            exerciseId={photo}
            variant="hero"
            fade={false}
            position={photoPosition(photo, "card")}
            className="absolute inset-0 aspect-auto h-full"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-linear-to-r from-background/95 via-background/82 via-50% to-background/25"
          />
        </>
      )}

      <div className="absolute top-2.5 bottom-2.5 left-3.5 flex w-[212px] flex-col justify-between">
        <div>
          <p className={cn(EYEBROW, isNext ? "text-accent-primary" : "text-muted-foreground")}>
            {sequenceLabel(index)} · {workout.templateId} · {minutes} min
          </p>
          <h2
            id={headingId}
            className={cn(
              "mt-0.5 truncate font-display leading-[0.95] font-extrabold tracking-[0.01em] text-foreground uppercase",
              // The display face is wide: "Deadlift day" needs a smaller size to fit.
              name.length > 10 ? "text-[26px]" : "text-[32px]"
            )}
          >
            {isNext ? (
              <Link
                href="/workout/configure"
                aria-label={`Start ${name}`}
                className="outline-none after:absolute after:inset-0 after:rounded-[18px] after:content-[''] focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
              >
                {name}
              </Link>
            ) : (
              name
            )}
          </h2>
        </div>
        <ul aria-label={`${name} exercises`} className="flex flex-col gap-px">
          {workout.entries.map((entry) => (
            <EntryRow key={`${entry.exerciseId}-${entry.tier}`} entry={entry} />
          ))}
        </ul>
      </div>

      <span
        aria-hidden="true"
        className="absolute top-2 right-2 bottom-2 flex items-center rounded-[14px] bg-background/85 px-2"
      >
        <WorkoutFigure exerciseIds={figureIds} className="h-[92px]" />
      </span>

      {isNext && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[18px] ring-2 ring-accent-primary ring-inset"
        />
      )}
    </article>
  );
}
