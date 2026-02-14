"use client";

import { EXERCISES } from "@/lib/exercises";
import { dumbbellToBarbell } from "@/lib/dbConversion";
import { Badge } from "@/components/ui/badge";
import type { SetLog, Tier, ConfidenceLevel } from "@/types";

interface EquipmentAdaptedResultProps {
  exerciseId: string;
  substituteExerciseId: string;
  tier: Tier;
  sets: SetLog[];
  confidenceLevel: ConfidenceLevel;
  passed: boolean;
}

const CONFIDENCE_STYLES: Record<
  ConfidenceLevel,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  high: { label: "High", variant: "default" },
  medium: { label: "Med", variant: "secondary" },
  low: { label: "Low", variant: "destructive" },
};

export default function EquipmentAdaptedResult({
  exerciseId,
  substituteExerciseId,
  tier,
  sets,
  confidenceLevel,
  passed,
}: EquipmentAdaptedResultProps) {
  if (sets.length === 0) return null;

  const originalExercise = EXERCISES[exerciseId];
  const substituteExercise = EXERCISES[substituteExerciseId];
  const dbWeight = sets[0]?.weight ?? 0;
  const barbellEquiv = dumbbellToBarbell(dbWeight);
  const confidenceInfo = CONFIDENCE_STYLES[confidenceLevel];

  const setsCount = sets.length;
  const targetReps = sets[0]?.targetReps ?? 0;
  const isAMRAP = sets.some((s) => s.isAMRAP);
  const setRepDisplay = `${setsCount}x${targetReps}${isAMRAP ? "+" : ""}`;

  return (
    <div className="space-y-1 rounded-lg bg-muted/50 border border-primary/10 px-4 py-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-primary/70">{tier}</span>
            <Badge variant={confidenceInfo.variant} className="text-[10px] px-1.5 py-0">
              {confidenceInfo.label}
            </Badge>
          </div>
          <p className="text-sm font-medium text-foreground">
            {substituteExercise?.name ?? substituteExerciseId}
          </p>
          <p className="text-xs text-muted-foreground">
            (adapted from {originalExercise?.name ?? exerciseId})
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-foreground">
            {setRepDisplay} @ {dbWeight} lbs/hand
          </p>
        </div>
      </div>

      {/* Barbell equivalent */}
      <p className="text-xs text-muted-foreground">
        = barbell equiv. {barbellEquiv} lbs
      </p>

      {/* Status */}
      <p className={passed ? "text-sm text-green-400" : "text-sm text-red-400"}>
        {passed ? "\u2713" : "\u2717"}{" "}
        {passed
          ? "Passed \u2014 progression tracks barbell weight"
          : "Not completed"}
      </p>

      {/* Set-by-set detail */}
      <div className="flex gap-1 flex-wrap">
        {sets.map((s, i) => (
          <span
            key={s.id}
            className={`text-xs px-1.5 py-0.5 rounded ${
              s.status === "completed"
                ? "bg-green-500/10 text-green-400"
                : s.status === "failed"
                  ? "bg-red-500/10 text-red-400"
                  : "bg-yellow-500/10 text-yellow-400"
            }`}
          >
            Set {i + 1}: {s.actualReps}
            {s.isAMRAP ? "+" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
