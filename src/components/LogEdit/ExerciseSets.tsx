"use client";

import { AlertTriangle, Plus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { TierBadge } from "@/components/ui/tier-badge";
import { cn } from "@/lib/utils";
import type { SetLog } from "@/types";
import { formatLbs, liftName, setStatusText } from "./format";
import type { ExerciseGroup } from "./groupSets";

function SetSummary({ set }: { set: SetLog }) {
  const status = setStatusText(set.status);
  return (
    <>
      <span className="font-mono text-[15px] font-semibold tabular-nums text-foreground">
        {formatLbs(set.weight)} lbs
      </span>
      <span className="font-mono tabular-nums text-foreground">
        {set.actualReps}
        {set.isAMRAP ? "+" : ""} reps
      </span>
      {set.isAMRAP && <span className="text-xs text-muted-foreground">AMRAP</span>}
      {set.rpe !== undefined && (
        <span className="text-xs text-muted-foreground">RPE {formatLbs(set.rpe)}</span>
      )}
      {status && (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium",
            set.status === "failed" ? "text-destructive" : "text-warning"
          )}
        >
          {set.status === "failed" ? (
            <XCircle className="size-3.5" aria-hidden="true" />
          ) : (
            <AlertTriangle className="size-3.5" aria-hidden="true" />
          )}
          {status}
        </span>
      )}
    </>
  );
}

function WarmupRow({ set }: { set: SetLog }) {
  return (
    <li
      data-kind="warmup"
      className="flex min-h-9 items-center gap-3 border-b border-border py-1.5 text-sm text-muted-foreground opacity-80"
    >
      <span className="w-16 shrink-0 text-xs">Warm-up</span>
      <span className="font-mono tabular-nums">{formatLbs(set.weight)} lbs</span>
      <span className="font-mono tabular-nums">{set.actualReps} reps</span>
    </li>
  );
}

function WorkingRow({ set, onEdit }: { set: SetLog; onEdit: (set: SetLog) => void }) {
  return (
    <li data-kind="working" className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => onEdit(set)}
        className="flex min-h-[52px] w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left outline-none transition-colors hover:bg-card/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="w-12 shrink-0 text-xs text-muted-foreground">Set {set.setNumber}</span>
        <TierBadge tier={set.tier} variant="soft" />
        <SetSummary set={set} />
        <span className="sr-only">Edit set</span>
      </button>
    </li>
  );
}

/** One exercise's sets in the order performed: warm-ups quieter, working sets tappable. */
export function ExerciseSets({
  group,
  onEditSet,
  onAddSet,
}: {
  group: ExerciseGroup;
  onEditSet: (set: SetLog) => void;
  onAddSet?: () => void;
}) {
  const name = liftName(group.exerciseId);
  return (
    <section aria-label={name} className="flex flex-col gap-1">
      <SectionHeader
        as="h3"
        title={
          <span className="inline-flex items-center gap-2 normal-case">
            <span className="text-sm text-foreground">{name}</span>
            {group.tiers.map((tier) => (
              <TierBadge key={tier} tier={tier} />
            ))}
          </span>
        }
        action={
          onAddSet && (
            <Button
              variant="ghost"
              className="h-11"
              onClick={onAddSet}
              aria-label={`Add set to ${name}`}
            >
              <Plus aria-hidden="true" />
              Add set
            </Button>
          )
        }
      />
      <ul>
        {group.sets.map((set) =>
          set.tier === "warmup" ? (
            <WarmupRow key={set.id} set={set} />
          ) : (
            <WorkingRow key={set.id} set={set} onEdit={onEditSet} />
          )
        )}
      </ul>
    </section>
  );
}
