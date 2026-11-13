"use client";

import { useState } from "react";
import type { ExercisePreference, PreferenceScope, WorkoutLocation } from "@/types";
import { useSettings, useTrainingLocation } from "@/hooks";
import { updateSettings } from "@/lib/data/records";
import { isPreferenceEditable } from "@/lib/exerciseCategories";
import {
  getScopedPreference,
  isLocationOverride,
  setScopedPreference,
} from "@/lib/exercisePreferences";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

interface PreferenceControlProps {
  exerciseId: string;
  /** Scope selected first; pass the current workout's location mid-workout. */
  defaultScope?: PreferenceScope | WorkoutLocation;
  className?: string;
}

const SCOPES: { value: PreferenceScope; label: string }[] = [
  { value: "all", label: "Everywhere" },
  { value: "gym", label: "Gym" },
  { value: "home", label: "Home" },
];

const OPTIONS: { value: ExercisePreference; label: string; active: string }[] = [
  { value: "blocked", label: "Blocked", active: "bg-destructive/10 text-destructive" },
  { value: "normal", label: "Normal", active: "bg-muted text-foreground" },
  { value: "preferred", label: "Preferred", active: "bg-success/15 text-success" },
];

/**
 * Captions under a three-option scope control (all, gym, home, in that order, with
 * equal-width segments): "current" under the option that matches where the user is
 * training, so "which preferences am I editing" and "where am I" stay separate.
 */
export function CurrentLocationMarks({
  location,
  className,
}: {
  location: WorkoutLocation;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("grid grid-cols-3 px-1 text-center text-[11px] leading-4", className)}
    >
      {(["all", "gym", "home"] as const).map((scope) => (
        <span
          key={scope}
          data-current-location={scope === location || undefined}
          className="font-medium text-accent-primary"
        >
          {scope === location ? "current" : ""}
        </span>
      ))}
    </div>
  );
}

/**
 * Set an accessory's preference (blocked / normal / preferred) for everywhere,
 * the gym, or home. Renders nothing for exercises whose preference cannot be
 * changed (the main lifts and their substitutes).
 */
export function PreferenceControl({
  exerciseId,
  defaultScope = "all",
  className,
}: PreferenceControlProps) {
  const settings = useSettings();
  const { location: trainingLocation } = useTrainingLocation();
  const [scope, setScope] = useState<PreferenceScope>(defaultScope);

  if (!isPreferenceEditable(exerciseId) || !settings) return null;

  const overall = settings.exercisePreferences;
  const byLocation = settings.exercisePreferencesByLocation;
  const current = getScopedPreference(overall, byLocation, scope, exerciseId);
  const overridden = scope !== "all" && isLocationOverride(byLocation, scope, exerciseId);

  const choose = async (preference: ExercisePreference) => {
    const next = setScopedPreference(overall, byLocation, scope, exerciseId, preference);
    await updateSettings({
      exercisePreferences: next.overall,
      exercisePreferencesByLocation: next.byLocation,
    });
  };

  return (
    <div className={cn("space-y-2", className)} data-preference-control={exerciseId}>
      <div className="space-y-0.5">
        <span className="text-xs text-muted-foreground">Preference for</span>
        <SegmentedControl value={scope} onChange={setScope} options={SCOPES} />
        <CurrentLocationMarks location={trainingLocation} />
      </div>
      <div className="flex overflow-hidden rounded-md border border-border">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => choose(opt.value)}
            aria-pressed={current === opt.value}
            className={cn(
              "flex-1 px-2 py-2 text-xs font-medium transition-colors",
              current === opt.value ? opt.active : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {scope === "all"
          ? "Preferred exercises are offered first when you set up a workout."
          : overridden
            ? `Set for ${scope === "gym" ? "Gym" : "Home"} workouts only.`
            : `Following your Everywhere setting. Change it here to set ${
                scope === "gym" ? "Gym" : "Home"
              } only.`}
      </p>
    </div>
  );
}
