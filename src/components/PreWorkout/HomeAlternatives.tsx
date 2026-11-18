"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EXERCISES } from "@/lib/exercises";
import { cn } from "@/lib/utils";
import type { AdaptationStatus, ConfidenceLevel, Tier } from "@/types";
import { EditWorkoutSheet } from "./EditWorkoutSheet";
import type { HomeAdaptation, WorkoutSetup } from "./useWorkoutSetup";

interface HomeAlternativesProps {
  adaptations: HomeAdaptation[];
  maxDumbbellWeight: number;
  /** Opens the swap sheet on that lift, where its home version is chosen. */
  onChange?: (templateExerciseId: string, tier: Tier) => void;
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
 * How each lift is adapted for home: the home version the plan does it as, at the
 * weight planned, and how well that fits the dumbbells on hand. An information panel:
 * the choice itself is made in the swap sheet ("Change"), the one place a lift's home
 * version is chosen, where the weight and the progression line are shown.
 */
export function HomeAlternatives({ adaptations, maxDumbbellWeight, onChange, evidence }: HomeAlternativesProps) {
  return (
    <div className="space-y-4">
      {adaptations.map(({ templateExercise, weight, adaptation, chosenExerciseId, plannedWeight }) => {
        const id = templateExercise.exerciseId;
        const tier = templateExercise.tier;
        const adaptedId = adaptation.adaptedExercise.id;
        const exercise = (chosenExerciseId ? EXERCISES[chosenExerciseId] : undefined) ?? adaptation.adaptedExercise;
        // Another home version than the conversion's pick is chosen for today.
        const otherPick = exercise.id !== adaptedId;
        const shownWeight =
          plannedWeight ??
          adaptation.alternatives.find((alt) => alt.exercise.id === exercise.id)?.weight ??
          adaptation.adaptedWeight;
        // Another home version is judged on whether its weight is available.
        const status: AdaptationStatus = otherPick
          ? shownWeight <= maxDumbbellWeight
            ? "fits"
            : "exceeds"
          : adaptation.adaptationStatus;
        const confidence = CONFIDENCE[adaptation.confidenceLevel];
        const original = adaptation.originalExercise.name;

        return (
          <div key={`${id}-${tier}`} className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 pt-2.5 text-sm font-medium">
                <span className="text-muted-foreground">{tier}</span> {original}
                {weight > 0 && <span className="font-mono tabular-nums"> @ {weight} lbs</span>}
              </p>
              {onChange && plannedWeight !== undefined && (
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 shrink-0"
                  aria-label={`Change ${original}`}
                  onClick={() => onChange(id, tier)}
                >
                  Change
                </Button>
              )}
            </div>

            {status === "no_substitute" || exercise.id === id ? (
              <p className="text-sm text-muted-foreground">
                {status === "no_substitute" ? "No home substitute available" : "Performed as written"}
              </p>
            ) : (
              <>
                <p className="text-sm">
                  {exercise.name}{" "}
                  <span data-testid="home-planned-weight" className="font-mono tabular-nums">
                    @ {shownWeight} lbs{exercise.grip === "per_hand" ? "/hand" : ""}
                  </span>
                  {otherPick && <span className="text-muted-foreground"> · chosen for today</span>}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={status} />
                  <Badge className={cn("border-0", confidence.className)}>{confidence.label}</Badge>
                  {evidence}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Ready's home panel wired to the swap sheet: "Change" opens Edit workout's swap sheet
 * on that lift, which chooses a home version through `setup.chooseSubstitute`.
 */
export function HomeAlternativesPanel({ setup, evidence }: { setup: WorkoutSetup; evidence?: ReactNode }) {
  const [changing, setChanging] = useState<{ exerciseId: string; tier: Tier } | null>(null);
  return (
    <>
      <HomeAlternatives
        adaptations={setup.homeAdaptations}
        maxDumbbellWeight={setup.equipment.maxDumbbellWeight}
        onChange={(exerciseId, tier) => setChanging({ exerciseId, tier })}
        evidence={evidence}
      />
      <EditWorkoutSheet
        setup={setup}
        open={changing !== null}
        onOpenChange={(open) => {
          if (!open) setChanging(null);
        }}
        swapLift={changing}
      />
    </>
  );
}
