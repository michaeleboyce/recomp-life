"use client";

import type { ReactNode } from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import type { RepsInReserve } from "@/types";

interface AutoRegCalloutProps {
  /** What the lifter answered after the first set. */
  repsInReserve: RepsInReserve;
  reducedWeight: number;
  onAccept: () => void;
  onKeep: () => void;
  /** The evidence line explaining the suggestion. */
  evidence?: ReactNode;
}

/** The T2 load-drop suggestion after a hard first set. The user decides. */
export function AutoRegCallout({
  repsInReserve,
  reducedWeight,
  onAccept,
  onKeep,
  evidence,
}: AutoRegCalloutProps) {
  return (
    <Callout
      variant="warning"
      title="Auto-adjust suggested"
      icon={<Zap className="size-4 text-warning" aria-hidden="true" />}
      actions={
        <>
          <Button size="sm" onClick={onAccept}>
            Accept Drop
          </Button>
          <Button size="sm" variant="outline" onClick={onKeep}>
            Keep Weight
          </Button>
        </>
      }
    >
      <p>
        {repsInReserve === "0" ? (
          "You had nothing left after your first set."
        ) : (
          <>
            Your first set left you <span className="font-mono">{repsInReserve}</span> reps.
          </>
        )}{" "}
        Drop to{" "}
        <span className="font-mono">{reducedWeight} lb</span> for the remaining sets?
      </p>
      {evidence}
    </Callout>
  );
}
