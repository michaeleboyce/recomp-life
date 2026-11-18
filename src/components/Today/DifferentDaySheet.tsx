"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, XIcon } from "lucide-react";
import { useCompletedWorkouts, useSettings, useUpcomingWorkouts } from "@/hooks";
import { upcomingWorkoutHref } from "@/lib/routes";
import { nextOccurrences, type UpcomingWorkout } from "@/lib/workout/upcoming";
import type { WorkoutLocation } from "@/types";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { upcomingMinutes } from "@/components/Upcoming/sessionMinutes";
import { formatLbs } from "./format";
import { dayName, displayLiftName } from "./todayModel";

/** "Squat 190 · Bench press 100 · Lat pulldown 90": a day's lifts as the projection plans them. */
function liftsLine(workout: UpcomingWorkout): string {
  return workout.entries
    .map((e) => `${displayLiftName(e.substituteExerciseId || e.exerciseId)} ${e.weight > 0 ? formatLbs(e.weight) : "BW"}`)
    .join(" · ");
}

/**
 * The quiet "Do a different day" control under Today's START (W6): a small sheet with
 * the four days, the due one marked, each with its lifts and length, opening its full
 * view at the next time it comes round. Doing another day does not move the rotation.
 */
export function DifferentDayButton({ location }: { location: WorkoutLocation }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex min-h-11 items-center justify-center text-[13px] font-semibold text-accent-primary underline decoration-dotted underline-offset-4 outline-none focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        Do a different day
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="max-h-[90dvh] gap-0 overflow-y-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="relative gap-1 px-5 pb-2">
            <SheetTitle className="font-display text-2xl leading-none font-extrabold uppercase">Pick a day</SheetTitle>
            <SheetDescription className="pr-10 text-[13px]">
              Doing another day does not move the rotation: the due day stays next.
            </SheetDescription>
            <SheetClose className="absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden">
              <XIcon className="size-5" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </SheetClose>
          </SheetHeader>
          {open && <DayList location={location} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function DayList({ location }: { location: WorkoutLocation }) {
  // Four in a row are the four days, the due one first.
  const upcoming = useUpcomingWorkouts(location, 4);
  const finished = useCompletedWorkouts();
  const settings = useSettings();
  const [now] = useState(() => new Date());
  if (!upcoming || finished === undefined || settings === undefined) {
    return <p className="px-5 pb-6 text-[13px] text-muted-foreground">Working out the days…</p>;
  }
  return (
    <ul aria-label="Workout days" className="flex flex-col px-5 pb-6">
      {nextOccurrences(upcoming).map((position) => {
        const workout = upcoming[position];
        const t1 = workout.template.exercises.find((e) => e.tier === "T1")?.exerciseId;
        const minutes = upcomingMinutes(workout.plan, finished, settings?.trainingPhase, now);
        return (
          <li key={workout.templateId} data-testid="different-day" className="border-t border-border first:border-t-0">
            <Link
              href={upcomingWorkoutHref(position, location, "today")}
              className="flex min-h-[60px] items-center gap-3 py-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="font-mono text-[12px] font-medium text-muted-foreground">{workout.templateId}</span>
                  <span className="text-[15px] font-bold text-foreground">{dayName(t1, workout.template.name)}</span>
                  {position === 0 && (
                    <span className="rounded-full bg-accent-primary-soft px-2 py-0.5 text-[12px] font-semibold text-accent-primary">
                      due
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{liftsLine(workout)}</span>
              </span>
              {minutes !== null && <span className="shrink-0 text-xs text-muted-foreground">{minutes} min</span>}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
