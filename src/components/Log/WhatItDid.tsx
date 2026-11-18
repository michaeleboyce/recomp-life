"use client";

import { ArrowDownRight, ArrowUpRight, CircleSlash, Minus, Pause, RotateCcw } from "lucide-react";
import type { ComponentType } from "react";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { SectionHeader } from "@/components/ui/section-header";
import { TierBadge } from "@/components/ui/tier-badge";
import { useWorkout } from "@/hooks";
import { isRuleId, type RuleId } from "@/lib/evidence";
import { cn } from "@/lib/utils";
import { describeSessionOutcomes, type OutcomeKind, type SessionOutcomeRow } from "./outcomes";
import { useWorkoutSnapshots } from "./useWorkoutSnapshots";
import { AccessoryOutcomeRow, useAccessoryOutcomes } from "./AccessoryOutcomes";

export { outcomeLiftName } from "./outcomes";

const ICON: Record<OutcomeKind, ComponentType<{ className?: string }>> = {
  passed: ArrowUpRight,
  t3Up: ArrowUpRight,
  stageDown: ArrowDownRight,
  reset: RotateCcw,
  held: Pause,
  partial: Minus,
  loggedOnly: Minus,
  t3Same: Minus,
  notDone: CircleSlash,
};

const TONE: Partial<Record<OutcomeKind, string>> = {
  passed: "text-success",
  t3Up: "text-success",
  stageDown: "text-warning",
  reset: "text-warning",
};

/** The rule a row cites: a home exercise's own rule, else the program's for its tier. */
function rowRule(row: SessionOutcomeRow): RuleId {
  if (row.home && isRuleId(row.ruleId)) return row.ruleId;
  return row.tier === "T3" ? "t3-progression" : "gzclp-progression";
}

function OutcomeRow({ row, hideLibraryLink }: { row: SessionOutcomeRow; hideLibraryLink: boolean }) {
  const Icon = ICON[row.kind];
  const ruleId = rowRule(row);
  return (
    <li data-outcome={row.kind} className="flex flex-col gap-1 border-b border-border py-2.5 last:border-b-0">
      <div className="flex min-h-11 items-center gap-3">
        <TierBadge tier={row.tier} variant="soft" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-foreground">{row.name}</p>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Icon className={cn("size-4 shrink-0", TONE[row.kind])} aria-hidden="true" />
            <span>{row.text}</span>
          </p>
        </div>
        {row.tier !== "T3" && <EvidenceLine ruleId={ruleId} variant="icon" hideLibraryLink={hideLibraryLink} />}
      </div>
      {row.tier === "T3" && <EvidenceLine ruleId={ruleId} hideLibraryLink={hideLibraryLink} />}
    </li>
  );
}

/**
 * What a finished workout did to each program lift, as of that workout: the outcomes
 * the progression rules reported when the rebuild replayed it, so a past session shows
 * what it did then, not what the lift looks like today. At home, a lift done as a home
 * exercise shows that exercise and its own next weight.
 */
export function WhatItDid({ workoutId, hideLibraryLink = false }: { workoutId: string; hideLibraryLink?: boolean }) {
  const workout = useWorkout(workoutId);
  const snapshots = useWorkoutSnapshots(workoutId);
  // Each accessory: what double progression does with it next time (A10).
  const accessories = useAccessoryOutcomes(workout);
  if (!workout || !snapshots) return null;
  const rows = describeSessionOutcomes(workout, snapshots.outcomes, snapshots.variantOutcomes);
  if (rows.length === 0 && !accessories?.length) return null;

  return (
    <section aria-label="What it did" className="flex flex-col gap-1">
      <SectionHeader title="What it did" />
      <ul>
        {rows.map((row) => (
          <OutcomeRow key={row.key} row={row} hideLibraryLink={hideLibraryLink} />
        ))}
        {accessories?.map((outcome) => <AccessoryOutcomeRow key={outcome.exerciseId} outcome={outcome} />)}
      </ul>
    </section>
  );
}
