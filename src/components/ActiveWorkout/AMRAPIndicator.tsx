"use client";

import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { getAMRAPGuidance } from "@/lib/amrap";
import type { TrainingPhase, Tier } from "@/types";

interface AMRAPIndicatorProps {
  tier: Tier;
  trainingPhase: TrainingPhase;
}

export function AMRAPIndicator({ tier }: AMRAPIndicatorProps) {
  const guidance = getAMRAPGuidance(tier);

  return (
    <Alert className="mx-4 border-amber-500/50 bg-amber-500/10">
      <AlertTitle className="font-semibold text-amber-400">
        AMRAP Set -- As Many Reps As Possible
      </AlertTitle>
      {guidance && (
        <AlertDescription className="text-amber-300/80 text-xs mt-1">
          {guidance}
        </AlertDescription>
      )}
    </Alert>
  );
}
