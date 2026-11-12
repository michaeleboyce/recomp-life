"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/ui/tier-badge";
import { templateTitle } from "@/components/ActiveWorkout/templateTitle";
import { getExercise } from "@/lib/exercises";
import type { UpcomingEntry, UpcomingWorkout } from "@/lib/workout/upcoming";

function weightLabel(entry: UpcomingEntry): string {
  if (entry.weight <= 0) return "Bodyweight";
  const info = getExercise(entry.substituteExerciseId || entry.exerciseId);
  return info.grip === "per_hand" ? `${entry.weight} lbs/hand` : `${entry.weight} lbs`;
}

function EntryRow({ entry }: { entry: UpcomingEntry }) {
  const info = getExercise(entry.substituteExerciseId || entry.exerciseId);
  const original = entry.substituteExerciseId ? getExercise(entry.exerciseId) : null;
  return (
    <li
      data-testid="upcoming-exercise"
      data-assumed={entry.assumed || undefined}
      className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0"
    >
      <TierBadge tier={entry.tier} variant="soft" className="w-10 rounded-md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{info.name}</p>
        {original && (
          <p className="truncate text-xs text-muted-foreground">in place of {original.name}</p>
        )}
      </div>
      <div className="shrink-0 text-right font-mono tabular-nums">
        <p className="text-sm font-semibold text-foreground">{weightLabel(entry)}</p>
        <p className="text-xs text-muted-foreground">
          {entry.sets}×{entry.reps}
          {entry.isAMRAP ? "+" : ""}
        </p>
      </div>
    </li>
  );
}

/** One upcoming workout: "Next" (with START) or "Then", its title and working sets. */
export function UpcomingWorkoutCard({ workout, isNext }: { workout: UpcomingWorkout; isNext: boolean }) {
  const title = templateTitle(workout.templateId);
  return (
    <article
      aria-label={title}
      data-testid="upcoming-workout"
      className="flex flex-col gap-1 rounded-2xl bg-card px-4 pt-3.5 pb-2"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {isNext ? "Next" : "Then"}
          </p>
          <h2 className="truncate text-base font-bold text-foreground">{title}</h2>
        </div>
        {isNext && (
          <Button asChild size="sm" className="font-bold">
            <Link href="/workout/configure">START</Link>
          </Button>
        )}
      </div>
      <ul aria-label={`${title} exercises`}>
        {workout.entries.map((entry) => (
          <EntryRow key={`${entry.exerciseId}-${entry.tier}`} entry={entry} />
        ))}
      </ul>
    </article>
  );
}
