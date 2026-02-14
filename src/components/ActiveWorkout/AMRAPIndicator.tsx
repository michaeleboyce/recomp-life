"use client";

import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import type { TrainingPhase, Tier } from "@/types";

interface AMRAPIndicatorProps {
  tier: Tier;
  trainingPhase: TrainingPhase;
}

export function AMRAPIndicator({ tier, trainingPhase }: AMRAPIndicatorProps) {
  return (
    <Alert className="mx-4 border-amber-500/50 bg-amber-500/10">
      <AlertTitle className="font-semibold text-amber-400">
        AMRAP Set -- As Many Reps As Possible
      </AlertTitle>
      {tier === "T1" && trainingPhase.mode === "cutting" && (
        <AlertDescription className="text-amber-300/80 text-xs mt-1">
          Cutting mode: aim for RPE 9 (1 rep in reserve)
        </AlertDescription>
      )}
    </Alert>
  );
}
