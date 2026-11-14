"use client";

import { Trophy } from "lucide-react";
import { Callout } from "@/components/ui/callout";
import { formatLbs, liftName } from "@/components/LogEdit/format";
import { useE1RMs } from "@/hooks";
import { sessionPRs } from "./prs";

/** "New best": lifts whose estimated 1RM in this workout beat every earlier session. */
export function SessionPRCallout({ workoutId }: { workoutId: string }) {
  const e1rms = useE1RMs();
  if (!e1rms) return null;
  const prs = sessionPRs(workoutId, e1rms);
  if (prs.length === 0) return null;

  return (
    <Callout
      variant="success"
      icon={<Trophy className="size-4 text-success" aria-hidden="true" />}
      title={prs.length === 1 ? "New best estimated 1RM" : "New best estimated 1RMs"}
    >
      <ul>
        {prs.map((pr) => (
          <li key={pr.exerciseId}>
            {liftName(pr.exerciseId)}:{" "}
            <span className="font-mono tabular-nums text-foreground">{formatLbs(pr.best)} lbs</span>{" "}
            (was {formatLbs(pr.previousBest)})
          </li>
        ))}
      </ul>
    </Callout>
  );
}
