"use client";

import { useState } from "react";
import type { ExercisePreference, PreferenceScope, WorkoutLocation } from "@/types";
import { useSettings } from "@/hooks";
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
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-xs text-muted-foreground">Preference for</span>
        <SegmentedControl value={scope} onChange={setScope} options={SCOPES} className="flex-1" />
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
