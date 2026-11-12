"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AdaptationStatus, ConfidenceLevel } from "@/types";
import type { HomeAdaptation } from "./useWorkoutSetup";

interface HomeAlternativesProps {
  adaptations: HomeAdaptation[];
  maxDumbbellWeight: number;
  onChoose: (templateExerciseId: string, substituteExerciseId: string) => void;
  /** Evidence for the dumbbell conversion, supplied by the page that owns it. */
  evidence?: ReactNode;
}

function StatusBadge({ status }: { status: AdaptationStatus }) {
  switch (status) {
    case "fits":
      return (
        <Badge variant="secondary">
          <Check className="size-3" /> Fits
        </Badge>
      );
    case "borderline":
      return (
        <Badge className="border-0 bg-warning-soft text-warning">
          <AlertTriangle className="size-3" /> Borderline
        </Badge>
      );
    case "exceeds":
      return (
        <Badge variant="destructive">
          <X className="size-3" /> Exceeds
        </Badge>
      );
    case "no_substitute":
      return <Badge variant="outline">No substitute</Badge>;
    default:
      return null;
  }
}

const CONFIDENCE: Record<ConfidenceLevel, { label: string; className: string }> = {
  high: { label: "High conf.", className: "bg-success-soft text-success" },
  medium: { label: "Medium conf.", className: "bg-warning-soft text-warning" },
  low: { label: "Low conf.", className: "bg-destructive-soft text-destructive" },
};

/**
 * How each lift is adapted for home, how well the substitute fits the dumbbells
 * on hand, and, where there is a choice, which substitute to perform.
 */
export function HomeAlternatives({
  adaptations,
  maxDumbbellWeight,
  onChoose,
  evidence,
}: HomeAlternativesProps) {
  return (
    <div className="space-y-4">
      {adaptations.map(({ templateExercise, weight, adaptation, chosenExerciseId }) => {
        const id = templateExercise.exerciseId;
        const chosen =
          adaptation.alternatives.find((alt) => alt.exercise.id === chosenExerciseId) ?? null;
        const exercise = chosen?.exercise ?? adaptation.adaptedExercise;
        const adaptedWeight = chosen?.weight ?? adaptation.adaptedWeight;
        // A hand-picked alternative is judged on whether its weight is available.
        const status: AdaptationStatus =
          chosen && chosen.exercise.id !== adaptation.adaptedExercise.id
            ? chosen.weight <= maxDumbbellWeight
              ? "fits"
              : "exceeds"
            : adaptation.adaptationStatus;
        const confidence = CONFIDENCE[adaptation.confidenceLevel];

        return (
          <div key={`${id}-${templateExercise.tier}`} className="space-y-1.5">
            <p className="text-sm font-medium">
              <span className="text-muted-foreground">{templateExercise.tier}</span>{" "}
              {adaptation.originalExercise.name}
              {weight > 0 && <span className="font-mono tabular-nums"> @ {weight} lbs</span>}
            </p>

            {status === "no_substitute" || exercise.id === id ? (
              <p className="text-sm text-muted-foreground">
                {status === "no_substitute"
                  ? "No home substitute available"
                  : "Performed as written"}
              </p>
            ) : (
              <>
                <p className="text-sm">
                  {exercise.name}{" "}
                  <span className="font-mono tabular-nums">
                    @ {adaptedWeight} lbs{exercise.grip === "per_hand" ? "/hand" : ""}
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={status} />
                  <Badge className={cn("border-0", confidence.className)}>
                    {confidence.label}
                  </Badge>
                  {evidence}
                </div>
                {adaptation.alternatives.length > 1 && (
                  <div className="space-y-1 pt-1" role="group" aria-label="Alternatives">
                    <p className="text-xs text-muted-foreground">Alternatives:</p>
                    {adaptation.alternatives.map((alt) => {
                      const selected = exercise.id === alt.exercise.id;
                      return (
                        <button
                          key={alt.exercise.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => onChoose(id, alt.exercise.id)}
                          className={cn(
                            "min-h-11 w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                            selected
                              ? "border-accent-primary bg-accent-primary-soft"
                              : "border-border hover:border-foreground/20"
                          )}
                        >
                          <span className="font-medium">{alt.exercise.name}</span>{" "}
                          <span className="font-mono tabular-nums">
                            @ {alt.weight} {alt.exercise.grip === "per_hand" ? "lbs/hand" : "lbs"}
                          </span>
                          {alt.pros && (
                            <span className="ml-1 text-muted-foreground">{"\u00B7"} {alt.pros}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
