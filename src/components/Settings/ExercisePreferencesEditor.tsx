"use client";

import { useMemo, useState } from "react";
import { EXERCISES, ACCESSORY_IDS } from "@/lib/exercises";
import { getPreference } from "@/lib/exercisePreferences";
import type { ExercisePreference, ExercisePreferences } from "@/types";

interface ExercisePreferencesEditorProps {
  preferences: ExercisePreferences;
  onChange: (updated: ExercisePreferences) => void;
}

type FilterTab = "all" | "push" | "pull" | "legs" | "core";

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "push", label: "Push" },
  { value: "pull", label: "Pull" },
  { value: "legs", label: "Legs" },
  { value: "core", label: "Core" },
];

const PREFERENCE_OPTIONS: { value: ExercisePreference; label: string }[] = [
  { value: "blocked", label: "Blocked" },
  { value: "normal", label: "Normal" },
  { value: "preferred", label: "Preferred" },
];

function getEquipmentLabel(type: string): string {
  switch (type) {
    case "cable": return "Cable";
    case "dumbbell": return "Dumbbell";
    case "bodyweight": return "Bodyweight";
    default: return type;
  }
}

export default function ExercisePreferencesEditor({
  preferences,
  onChange,
}: ExercisePreferencesEditorProps) {
  const [filter, setFilter] = useState<FilterTab>("all");

  const accessories = useMemo(() => {
    return ACCESSORY_IDS
      .map((id) => EXERCISES[id])
      .filter(Boolean);
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return accessories;
    return accessories.filter((ex) => ex.muscleGroup === filter);
  }, [accessories, filter]);

  const handlePreferenceChange = (exerciseId: string, pref: ExercisePreference) => {
    const updated = { ...preferences };
    if (pref === "normal") {
      delete updated[exerciseId];
    } else {
      updated[exerciseId] = pref;
    }
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Exercise Preferences
        </h2>
        <p className="text-xs text-muted-foreground">
          Block exercises you never want suggested, or mark favorites as preferred.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFilter(tab.value)}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
              filter === tab.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Exercise list */}
      <div className="space-y-2">
        {filtered.map((exercise) => {
          const pref = getPreference(preferences, exercise.id);
          return (
            <div
              key={exercise.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-foreground truncate">
                  {exercise.name}
                </span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  {getEquipmentLabel(exercise.type)}
                </span>
              </div>

              {/* 3-button segmented control */}
              <div className="flex shrink-0 rounded-md border border-border overflow-hidden">
                {PREFERENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handlePreferenceChange(exercise.id, opt.value)}
                    className={`px-2 py-1 text-[11px] font-medium transition-colors ${
                      pref === opt.value
                        ? opt.value === "blocked"
                          ? "bg-destructive/10 text-destructive"
                          : opt.value === "preferred"
                            ? "bg-green-500/10 text-green-400"
                            : "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
