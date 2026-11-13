"use client";

import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { Term } from "@/components/ui/term";
import { getAMRAPGuidance } from "@/lib/amrap";
import type { Tier } from "@/types";

interface AMRAPIndicatorProps {
  tier: Tier;
}

/**
 * The context for an AMRAP set, written to sit on the "Set 5 of 5" line: what
 * AMRAP means (tap the word), how hard to push for this tier, and why.
 */
export function AMRAPIndicator({ tier }: AMRAPIndicatorProps) {
  const guidance = getAMRAPGuidance(tier);

  return (
    <span className="inline-flex items-center gap-1 text-warning">
      <span>
        {/* No links out of the sheet mid-set. */}
        <Term id="amrap" hideLinks className="font-semibold">
          AMRAP
        </Term>
        {guidance ? `: ${guidance.charAt(0).toLowerCase()}${guidance.slice(1)}` : ": as many reps as you can"}
      </span>
      {guidance && <EvidenceLine ruleId="amrap-effort" variant="icon" hideLibraryLink />}
    </span>
  );
}
