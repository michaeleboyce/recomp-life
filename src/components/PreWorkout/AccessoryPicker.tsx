"use client";

import { useMemo } from "react";
import { EXERCISES } from "@/lib/exercises";
import { HOME_ACCESSORY_ALTERNATIVES } from "@/lib/workoutTemplates";
import { getPreference } from "@/lib/exercisePreferences";
import { getPhaseAccessoryCap } from "@/lib/accessories";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import type { ExercisePreferences, TrainingPhase, WorkoutLocation } from "@/types";

interface AccessoryPickerProps {
  recommendations: string[];
  selectedAccessories: string[];
  onToggle: (exerciseId: string) => void;
  trainingPhase: TrainingPhase;
  location?: WorkoutLocation;
  exercisePreferences?: ExercisePreferences;
}

function getPhaseLabel(phase: TrainingPhase): string {
  const max = getPhaseAccessoryCap(phase);
  switch (phase.mode) {
    case "cutting":
      return `Cutting: keep your usual volume, max ${max} recommended`;
    case "maintaining":
      return `Maintaining: max ${max} recommended`;
    case "bulking":
      return `Bulking: max ${max} recommended`;
  }
}

export function AccessoryPicker({
  recommendations,
  selectedAccessories,
  onToggle,
  trainingPhase,
  location = "gym",
  exercisePreferences,
}: AccessoryPickerProps) {
  const maxAccessories = getPhaseAccessoryCap(trainingPhase);
  const atMax = selectedAccessories.length >= maxAccessories;

  // Filter gym-only accessories at home, replacing with home alternatives.
  // Also filter out blocked exercises (including blocked home alternatives).
  const filteredRecommendations = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const id of recommendations) {
      const exercise = EXERCISES[id];
      if (!exercise) continue;

      if (location === "home" && exercise.requiresGym) {
        const altId = HOME_ACCESSORY_ALTERNATIVES[id];
        if (
          altId &&
          EXERCISES[altId] &&
          !seen.has(altId) &&
          getPreference(exercisePreferences, altId) !== "blocked"
        ) {
          seen.add(altId);
          result.push(altId);
        }
      } else if (
        !seen.has(id) &&
        getPreference(exercisePreferences, id) !== "blocked"
      ) {
        seen.add(id);
        result.push(id);
      }
    }

    return result;
  }, [recommendations, location, exercisePreferences]);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          ({getPhaseLabel(trainingPhase)})
          {trainingPhase.mode === "cutting" && (
            <EvidenceLine ruleId="accessories-in-cut" variant="icon" />
          )}
        </p>
      </div>

      <div className="space-y-2">
        {filteredRecommendations.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No accessories available. Check your exercise preferences in Settings.
          </p>
        ) : (
          filteredRecommendations.map((exerciseId) => {
            const exercise = EXERCISES[exerciseId];
            if (!exercise) return null;

            const isSelected = selectedAccessories.includes(exerciseId);
            const isDisabled = !isSelected && atMax;
            const isPreferred = getPreference(exercisePreferences, exerciseId) === "preferred";

            return (
              <label
                key={exerciseId}
                className={`flex min-h-9 items-center gap-3 cursor-pointer ${
                  isDisabled ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isDisabled}
                  onChange={() => onToggle(exerciseId)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-sm">{exercise.name}</span>
                {isPreferred && (
                  <span className="rounded-full bg-success-soft px-1.5 py-0.5 text-[10px] font-medium text-success">
                    Preferred
                  </span>
                )}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
