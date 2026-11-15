"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import type { WorkoutLocation } from "@/types";
import { ExerciseImage, hasExercisePhoto } from "@/components/ui/exercise-image";
import { WorkoutFigure } from "@/components/ui/workout-figure";
import { Stripes } from "@/components/ui/stripes";
import { LocationToggle } from "./LocationToggle";
import { formatEyebrowDate, photoPosition } from "./todayModel";

/** Small capitals in the display face, as on the boards. */
export const EYEBROW = "font-display text-[11px] font-semibold uppercase tracking-[0.16em]";

/**
 * Today's first-load motion: the hero's words and figure, then each forecast tile, rise
 * into place (240 ms, ease-out) 40 ms apart, all done within 400 ms. `motion-safe:`
 * keeps it off under reduced motion; it never blocks a tap (the parts are there and
 * tappable from the start).
 */
export const SETTLE_IN = "motion-safe:animate-settle-in";
/** Delay before a part starts, by its place in the order (hero first, then tiles). */
export const SETTLE_STEP_MS = 40;

/** Parts that have already settled in this app session. */
const settled = new Set<string>();

/** For tests: as if the app had just opened. */
export function resetSettled(): void {
  settled.clear();
}

/**
 * True on the first time `part` is shown in this app session, for the life of that
 * element, so the settle-in plays on first load only: not on re-renders, and not when
 * coming back to Today from another tab.
 */
export function useSettleOnce(part: string): boolean {
  const [first] = useState(() => !settled.has(part));
  useEffect(() => {
    settled.add(part);
  }, [part]);
  return first;
}

/** Class and inline delay for a part that settles in at `step`, or nothing. */
export function settleProps(on: boolean, step: number): { className?: string; style?: CSSProperties } {
  if (!on) return {};
  return { className: SETTLE_IN, style: step > 0 ? { animationDelay: `${step * SETTLE_STEP_MS}ms` } : undefined };
}

/**
 * The photo fades from half-covered at the top (for the date and the switch), almost
 * clear through the middle, to the page colour under the title.
 */
const FADE =
  "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_55%,transparent)_0%,color-mix(in_srgb,var(--background)_10%,transparent)_34%,color-mix(in_srgb,var(--background)_86%,transparent)_76%,var(--background)_100%)]";

/**
 * The top of Today: a photo of the workout's main lift fading into the page, the date,
 * the gym/home switch, "Next up", the day's name and the muscles it works. Without a
 * photo for the lift the same parts sit on a plain card.
 */
export function TodayHero({
  templateId,
  title,
  working,
  location,
  onLocationChange,
}: {
  templateId: string;
  title: string;
  working: WorkoutExerciseState[];
  location: WorkoutLocation;
  onLocationChange: (next: WorkoutLocation) => void;
}) {
  const [today] = useState(() => new Date());
  const settle = useSettleOnce("today-hero");
  const t1 = working.find((entry) => entry.tier === "T1");
  const photoId = t1 ? (t1.substituteExerciseId ?? t1.exerciseId) : undefined;
  const photo = photoId && hasExercisePhoto(photoId) ? photoId : null;
  const figureIds = working.map((entry) => entry.substituteExerciseId ?? entry.exerciseId);
  const words = settleProps(settle, 0);
  const figure = settleProps(settle, 1);

  const top = (
    <div className="flex items-center justify-between gap-3">
      <span className={cn(EYEBROW, "text-foreground")}>{formatEyebrowDate(today)}</span>
      <LocationToggle value={location} onChange={onLocationChange} />
    </div>
  );

  const bottom = (
    <div className="flex items-end justify-between gap-2.5">
      <div
        data-settle={settle || undefined}
        className={cn("flex min-w-0 flex-col gap-2 pb-1.5", words.className)}
        style={words.style}
      >
        <span className={cn(EYEBROW, "text-accent-primary")}>Next up · {templateId}</span>
        <h2
          id="next-workout-title"
          className="font-display text-[42px] leading-[0.95] font-extrabold tracking-[0.01em] text-foreground uppercase"
        >
          {title}
        </h2>
        <Stripes />
      </div>
      <Link
        href="/progress?tab=muscles"
        aria-label="Muscles worked. Open the muscle map"
        data-settle={settle || undefined}
        className={cn(
          "shrink-0 rounded-2xl bg-background/85 px-2 pt-2 pb-1.5 outline-none transition-colors hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50",
          figure.className
        )}
        style={figure.style}
      >
        <WorkoutFigure exerciseIds={figureIds} className="h-[136px]" />
      </Link>
    </div>
  );

  if (!photo) {
    return (
      <section
        aria-labelledby="next-workout-title"
        data-testid="today-hero"
        data-photo="none"
        className="flex flex-col gap-5 rounded-b-[28px] bg-card px-5 pt-[calc(14px+env(safe-area-inset-top))] pb-3"
      >
        {top}
        {bottom}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="next-workout-title"
      data-testid="today-hero"
      data-photo={photo}
      className="relative h-[calc(322px+env(safe-area-inset-top))] overflow-hidden"
    >
      <ExerciseImage
        exerciseId={photo}
        variant="hero"
        fade={false}
        position={photoPosition(photo, "hero")}
        className="absolute inset-0 aspect-auto h-full"
      />
      <span aria-hidden="true" className={cn("absolute inset-0", FADE)} />
      <div className="absolute inset-x-5 top-[calc(14px+env(safe-area-inset-top))]">{top}</div>
      <div className="absolute right-4 bottom-0.5 left-5">{bottom}</div>
    </section>
  );
}
