"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Dumbbell, Home } from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { LocationChip } from "@/components/ui/location-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { TierKey } from "@/components/Upcoming/TierKey";
import { UpcomingWorkoutCard } from "@/components/Upcoming/UpcomingWorkoutCard";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import type { RuleId } from "@/lib/evidence";
import { useTrainingLocation, useUpcomingWorkouts } from "@/hooks";
import type { WorkoutLocation } from "@/types";

// The forecast applies the existing progression rule under a stated assumption.
// Passed as a value: this page is not yet in the rule's `surfaces` list.
const PROGRESSION_RULE: RuleId = "gzclp-progression";

const LOCATIONS = [
  { value: "gym" as const, label: "Gym", icon: <Dumbbell className="size-4" aria-hidden="true" /> },
  { value: "home" as const, label: "Home", icon: <Home className="size-4" aria-hidden="true" /> },
];

const LOCATION_LABEL: Record<WorkoutLocation, string> = { gym: "Gym", home: "Home" };

/** Back to where the page was opened from: Today (`?from=today`) or, by default, More. */
function UpcomingHeader() {
  const from = useSearchParams()?.get("from");
  return (
    <PageHeader title="Upcoming workouts" backHref={from === "today" ? "/" : "/more"} />
  );
}

export default function UpcomingWorkoutsPage() {
  const { location: defaultLocation, isLoading } = useTrainingLocation();
  // Previewing the other location here does not change the default.
  const [choice, setChoice] = useState<WorkoutLocation | null>(null);
  const location = choice ?? defaultLocation;
  const workouts = useUpcomingWorkouts(location, 5);
  const previewing = !isLoading && location !== defaultLocation;

  return (
    <PageShell className="flex flex-col gap-4">
      {/* Suspense is required around useSearchParams. */}
      <Suspense fallback={<PageHeader title="Upcoming workouts" backHref="/more" />}>
        <UpcomingHeader />
      </Suspense>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Showing exercises for</p>
          <LocationChip location={location} />
        </div>
        <SegmentedControl<WorkoutLocation>
          value={location}
          onChange={setChoice}
          options={LOCATIONS}
        />
        {previewing && (
          <p data-testid="location-preview" className="text-xs text-muted-foreground">
            Previewing {LOCATION_LABEL[location]}. Your default is {LOCATION_LABEL[defaultLocation]}.
          </p>
        )}
      </div>

      <TierKey />

      {isLoading || workouts === undefined ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {workouts.map((workout, index) => (
            <UpcomingWorkoutCard
              key={`${workout.templateId}-${index}`}
              workout={workout}
              index={index}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Weights after the next workout assume you complete every set. A missed set, a skipped
        day or a deload changes them.
      </p>
      <EvidenceLine ruleId={PROGRESSION_RULE} />
    </PageShell>
  );
}
