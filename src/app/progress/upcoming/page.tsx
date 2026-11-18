"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BackButton } from "@/components/nav/BackButton";
import { Skeleton } from "@/components/ui/skeleton";
import { TierKey } from "@/components/Upcoming/TierKey";
import { UpcomingWorkoutCard } from "@/components/Upcoming/UpcomingWorkoutCard";
import { LocationToggle } from "@/components/Today/LocationToggle";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import type { RuleId } from "@/lib/evidence";
import { useCompletedWorkouts, useSettings, useTrainingLocation, useUpcomingWorkouts } from "@/hooks";
import { upcomingMinutes } from "@/components/Upcoming/sessionMinutes";
import { parseLocation } from "@/components/Upcoming/upcomingView";
import { upcomingListHref } from "@/lib/routes";
import type { WorkoutLocation } from "@/types";

// The forecast applies the existing progression rule under a stated assumption.
// Passed as a value: this page is not yet in the rule's `surfaces` list.
const PROGRESSION_RULE: RuleId = "gzclp-progression";

const LOCATION_LABEL: Record<WorkoutLocation, string> = { gym: "Gym", home: "Home" };

function BackLinkTo({ today }: { today: boolean }) {
  return (
    <BackButton
      variant="label"
      fallback={today ? "/" : "/more"}
      label={today ? "Today" : "More"}
      className="text-accent-primary"
    />
  );
}

/**
 * Coming up: the next workouts in rotation order as photo cards, each with its
 * projected weights and the same session-length forecast Today shows; each opens that
 * workout in full. The gym/home switch here previews the other location without
 * changing the saved default; it is kept in the address (`?location=`), so coming back
 * from a workout returns to the same location. Back goes to the previous screen; with
 * none, to where the page was opened from: Today (`?from=today`) or, by default, More.
 */
export default function UpcomingWorkoutsPage() {
  return (
    // Suspense is required around useSearchParams in the static build.
    <Suspense fallback={<UpcomingWorkoutsList from={null} asked={null} />}>
      <UpcomingWorkoutsFromUrl />
    </Suspense>
  );
}

function UpcomingWorkoutsFromUrl() {
  const params = useSearchParams();
  const from = params?.get("from") === "today" ? "today" : null;
  return <UpcomingWorkoutsList from={from} asked={parseLocation(params?.get("location"))} />;
}

function UpcomingWorkoutsList({ from, asked }: { from: "today" | null; asked: WorkoutLocation | null }) {
  const { location: defaultLocation, isLoading } = useTrainingLocation();
  const settings = useSettings();
  const finished = useCompletedWorkouts();
  const [now] = useState(() => new Date());
  const [choice, setChoice] = useState<WorkoutLocation | null>(asked);
  const location = choice ?? defaultLocation;
  const workouts = useUpcomingWorkouts(location, 5);
  const previewing = !isLoading && location !== defaultLocation;
  const choose = (value: WorkoutLocation) => {
    setChoice(value);
    // In the address too, without a new history entry, so back from a card returns here.
    window.history.replaceState(null, "", upcomingListHref(value, from));
  };

  return (
    <div data-slot="page-shell" className="mx-auto flex max-w-lg flex-col gap-2.5 px-4 pt-[calc(4px+env(safe-area-inset-top))] pb-6">
      <header className="flex flex-col gap-0.5 px-1">
        <div className="flex items-center justify-between gap-3">
          <BackLinkTo today={from === "today"} />
          <LocationToggle value={location} onChange={choose} />
        </div>
        <h1 className="font-display text-[40px] leading-[0.95] font-extrabold tracking-[0.01em] text-foreground uppercase">
          Coming up
        </h1>
        <p className="text-xs text-muted-foreground">
          In rotation order. Weights assume you pass the session before.
        </p>
        {previewing && (
          <p data-testid="location-preview" className="text-xs text-accent-primary">
            Previewing {LOCATION_LABEL[location]}. Your default is {LOCATION_LABEL[defaultLocation]}.
          </p>
        )}
      </header>

      {isLoading || workouts === undefined || finished === undefined ? (
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[146px] rounded-[18px]" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {workouts.map((workout, index) => (
            <UpcomingWorkoutCard
              key={`${workout.templateId}-${index}`}
              workout={workout}
              index={index}
              minutes={upcomingMinutes(workout.plan, finished, settings?.trainingPhase, now)}
              location={location}
              from={from}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 px-1 pt-2">
        <TierKey />
        <p className="text-xs text-muted-foreground">
          Weights after the next workout assume you complete every set. A missed set, a skipped
          day or a deload changes them.
        </p>
        <EvidenceLine ruleId={PROGRESSION_RULE} />
      </div>
    </div>
  );
}
