"use client";

import { useState } from "react";
import { ChevronDown, Dumbbell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isPreferenceEditable } from "@/lib/exerciseCategories";
import { getPreference } from "@/lib/exercisePreferences";
import { getExercise } from "@/lib/exercises";
import { calculateE1RM } from "@/lib/e1rm";
import { formatRegion } from "@/lib/painModifications";
import type { Exercise, ExercisePreference, ExercisePreferences } from "@/types";

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  cable: "Cable",
  bodyweight: "Bodyweight",
};

const PREFERENCE_OPTIONS: { value: ExercisePreference; label: string }[] = [
  { value: "blocked", label: "Blocked" },
  { value: "normal", label: "Normal" },
  { value: "preferred", label: "Preferred" },
];

function getRoleLabel(exercise: Exercise): string {
  if (exercise.barbellEquivalent) return "Home alt.";
  const mainIds = ["squat", "bench", "deadlift", "ohp"];
  if (mainIds.includes(exercise.id)) return "T1/T2";
  if (exercise.id === "lat_pulldown" || exercise.id === "db_row") return "T3";
  return "";
}

interface ExerciseRowProps {
  exercise: Exercise;
  preferences: ExercisePreferences;
  onPreferenceChange: (exerciseId: string, pref: ExercisePreference) => void;
}

export default function ExerciseRow({
  exercise,
  preferences,
  onPreferenceChange,
}: ExerciseRowProps) {
  const [expanded, setExpanded] = useState(false);
  const pref = getPreference(preferences, exercise.id);
  const editable = isPreferenceEditable(exercise.id);
  const roleLabel = getRoleLabel(exercise);

  return (
    <div className="rounded-md border border-border overflow-hidden">
      {/* Collapsed row */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } }}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-accent/50 cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm font-medium text-foreground truncate">
            {exercise.name}
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {EQUIPMENT_LABELS[exercise.type] ?? exercise.type}
          </Badge>
          {exercise.requiresGym && (
            <Dumbbell className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
        </div>

        {editable ? (
          <div
            className="flex shrink-0 rounded-md border border-border overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {PREFERENCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onPreferenceChange(exercise.id, opt.value)}
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
        ) : (
          roleLabel && (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {roleLabel}
            </span>
          )
        )}

        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border bg-muted/30 px-3 py-2.5 space-y-1.5">
          <DetailRow label="Muscle group" value={capitalize(exercise.muscleGroup)} />
          <DetailRow
            label="Primary"
            value={exercise.primaryMuscles.map(formatRegion).join(", ")}
          />
          {exercise.secondaryMuscles.length > 0 && (
            <DetailRow
              label="Secondary"
              value={exercise.secondaryMuscles.map(formatRegion).join(", ")}
            />
          )}
          {exercise.painSensitiveRegions.length > 0 && (
            <DetailRow
              label="Pain-sensitive"
              value={exercise.painSensitiveRegions.map(formatRegion).join(", ")}
            />
          )}
          {exercise.dumbbellAlternative && (
            <DetailRow
              label="DB alternative"
              value={getExercise(exercise.dumbbellAlternative).name}
            />
          )}
          {exercise.barbellEquivalent && (
            <DetailRow
              label="Barbell equivalent"
              value={getExercise(exercise.barbellEquivalent).name}
            />
          )}
          {exercise.grip && (
            <DetailRow label="Grip" value={formatGrip(exercise.grip)} />
          )}
          <InlineE1RMCalc exerciseName={exercise.name} />
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatGrip(grip: string): string {
  return grip.split("_").map(capitalize).join(" ");
}

function InlineE1RMCalc({ exerciseName }: { exerciseName: string }) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  const weightNum = parseFloat(weight);
  const repsNum = parseInt(reps, 10);
  const e1rm =
    !isNaN(weightNum) && weightNum > 0 && !isNaN(repsNum) && repsNum >= 2
      ? calculateE1RM(weightNum, repsNum)
      : null;

  return (
    <div className="mt-2 pt-2 border-t border-border/50">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        Quick 1RM Estimate
      </p>
      <div className="flex items-end gap-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground block mb-0.5">
            Weight
          </label>
          <input
            type="number"
            inputMode="decimal"
            placeholder="lbs"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground"
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground block mb-0.5">
            Reps
          </label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="reps"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground"
          />
        </div>
        <div className="flex-1 text-right">
          {e1rm !== null ? (
            <p className="text-sm font-bold text-primary">{e1rm} lbs</p>
          ) : (
            <p className="text-[10px] text-muted-foreground">2+ reps</p>
          )}
        </div>
      </div>
    </div>
  );
}
