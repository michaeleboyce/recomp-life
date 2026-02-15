"use client";

import { useMemo } from "react";
import { EXERCISES } from "@/lib/exercises";
import { HOME_ACCESSORY_ALTERNATIVES } from "@/lib/workoutTemplates";
import type { TrainingPhase, WorkoutLocation } from "@/types";

interface AccessoryPickerProps {
  recommendations: string[];
  selectedAccessories: string[];
  onToggle: (exerciseId: string) => void;
  trainingPhase: TrainingPhase;
  location?: WorkoutLocation;
}

function getMaxAccessories(phase: TrainingPhase): number {
  switch (phase.mode) {
    case "cutting":
      return 2;
    case "maintaining":
      return 3;
    case "bulking":
      return 4;
  }
}

function getPhaseLabel(phase: TrainingPhase): string {
  switch (phase.mode) {
    case "cutting":
      return "Cutting mode: max 2 recommended";
    case "maintaining":
      return "Maintaining: max 3 recommended";
    case "bulking":
      return "Bulking: max 4 recommended";
  }
}

export function AccessoryPicker({
  recommendations,
  selectedAccessories,
  onToggle,
  trainingPhase,
  location = "gym",
}: AccessoryPickerProps) {
  const maxAccessories = getMaxAccessories(trainingPhase);
  const atMax = selectedAccessories.length >= maxAccessories;

  // Filter gym-only accessories at home, replacing with home alternatives
  const filteredRecommendations = useMemo(() => {
    if (location !== "home") return recommendations;

    const seen = new Set<string>();
    const result: string[] = [];

    for (const id of recommendations) {
      const exercise = EXERCISES[id];
      if (!exercise) continue;

      if (exercise.requiresGym) {
        const altId = HOME_ACCESSORY_ALTERNATIVES[id];
        if (altId && EXERCISES[altId] && !seen.has(altId)) {
          seen.add(altId);
          result.push(altId);
        }
      } else if (!seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    }

    return result;
  }, [recommendations, location]);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Add Accessories?</h3>
        <p className="text-xs text-muted-foreground">
          ({getPhaseLabel(trainingPhase)})
        </p>
      </div>

      <div className="space-y-2">
        {filteredRecommendations.map((exerciseId) => {
          const exercise = EXERCISES[exerciseId];
          if (!exercise) return null;

          const isSelected = selectedAccessories.includes(exerciseId);
          const isDisabled = !isSelected && atMax;

          return (
            <label
              key={exerciseId}
              className={`flex items-center gap-3 cursor-pointer ${
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
            </label>
          );
        })}
      </div>
    </div>
  );
}
