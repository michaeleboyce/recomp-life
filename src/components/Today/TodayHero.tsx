"use client";

import { useState } from "react";
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
  const t1 = working.find((entry) => entry.tier === "T1");
  const photoId = t1 ? (t1.substituteExerciseId ?? t1.exerciseId) : undefined;
  const photo = photoId && hasExercisePhoto(photoId) ? photoId : null;
  const figureIds = working.map((entry) => entry.substituteExerciseId ?? entry.exerciseId);

  const top = (
    <div className="flex items-center justify-between gap-3">
      <span className={cn(EYEBROW, "text-foreground")}>{formatEyebrowDate(today)}</span>
      <LocationToggle value={location} onChange={onLocationChange} />
    </div>
  );

  const bottom = (
    <div className="flex items-end justify-between gap-2.5">
      <div className="flex min-w-0 flex-col gap-2 pb-1.5">
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
        className="shrink-0 rounded-2xl bg-background/85 px-2 pt-2 pb-1.5 outline-none transition-colors hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
