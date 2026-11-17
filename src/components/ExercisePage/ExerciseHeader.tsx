"use client";

import { House } from "lucide-react";
import { cn } from "@/lib/utils";
import { BackButton } from "@/components/nav/BackButton";
import { ExerciseImage, hasExercisePhoto } from "@/components/ui/exercise-image";
import { WorkoutFigure } from "@/components/ui/workout-figure";
import { photoPosition } from "@/components/Today/todayModel";

const EYEBROW = "font-display text-[12px] font-semibold uppercase tracking-[0.16em] text-accent-primary";

/** Clear over the photo, then the page colour under the name. */
const BANNER_FADE =
  "bg-[linear-gradient(180deg,transparent_0%,transparent_45%,color-mix(in_srgb,var(--background)_80%,transparent)_80%,var(--background)_100%)]";

/**
 * Back on top; under it the exercise's photo with the eyebrow and name over its foot,
 * or, with no photo, the name beside its muscle figure. A house marks a home version.
 */
export function ExerciseHeader({
  exerciseId,
  title,
  eyebrow,
  backHref,
  home = false,
}: {
  exerciseId: string;
  title: string;
  eyebrow: string;
  backHref: string;
  home?: boolean;
}) {
  const photo = hasExercisePhoto(exerciseId);
  const heading = (
    <div className="flex min-w-0 flex-col gap-1">
      <span data-testid="exercise-eyebrow" className={cn(EYEBROW, "flex items-center gap-1.5")}>
        {home && <House className="size-3.5 shrink-0" aria-hidden="true" />}
        {eyebrow}
      </span>
      <h1 className="font-display text-[30px] leading-[1.05] font-extrabold text-foreground">{title}</h1>
    </div>
  );

  return (
    <header data-testid="exercise-header" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <BackButton fallback={backHref} />
      </div>
      {photo ? (
        <div className="relative h-[230px] overflow-hidden rounded-2xl">
          <ExerciseImage
            exerciseId={exerciseId}
            variant="hero"
            fade={false}
            // Framed as on Today's photo, where the user saw it before tapping.
            position={photoPosition(exerciseId, "hero")}
            className="absolute inset-0 aspect-auto h-full"
          />
          <span aria-hidden="true" className={cn("absolute inset-0", BANNER_FADE)} />
          <div className="absolute inset-x-4 bottom-3">{heading}</div>
        </div>
      ) : (
        <div className="flex items-end justify-between gap-3 rounded-2xl bg-card p-4">
          {heading}
          <WorkoutFigure exerciseIds={[exerciseId]} className="h-[120px] shrink-0" />
        </div>
      )}
    </header>
  );
}
