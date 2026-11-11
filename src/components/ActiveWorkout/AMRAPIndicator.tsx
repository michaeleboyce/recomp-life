"use client";

import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import type { TrainingPhase, Tier } from "@/types";

interface AMRAPIndicatorProps {
  tier: Tier;
  trainingPhase: TrainingPhase;
}

/**
 * How hard to push the last "as many reps as possible" set.
 *
 * Heavy T1 sets stop about one rep short of failure in every phase: strength
 * gains do not depend on reaching failure, and failure slows recovery.
 * Lighter T3 sets are pushed close to failure, where muscle growth benefits.
 *
 * @evidence amrap-effort
 */
export function getAMRAPGuidance(tier: Tier): string | null {
  if (tier === "T1") return "Stop with about 1 rep left (RPE 9)";
  if (tier === "T3") return "Push close to failure (0-2 reps left)";
  return null;
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
