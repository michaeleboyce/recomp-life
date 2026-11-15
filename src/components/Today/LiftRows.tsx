"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EXERCISES } from "@/lib/exercises";
import type { TermId } from "@/lib/glossary";
import { tierStyle } from "@/lib/tierStyle";
import { cn } from "@/lib/utils";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import type { Tier, WorkoutSession } from "@/types";
import { Term } from "@/components/ui/term";
import { formatLbs, formatSetsReps } from "./format";
import { displayLiftName, liftPageHref, liftReason, type LiftReason } from "./todayModel";

/** One lift on Today: what it is, why it is at this weight, and the weight. */
export interface TodayLiftRow {
  entry: WorkoutExerciseState;
  name: string;
  reason: LiftReason;
  /**
   * The decision trace's "why" link, when there is one. Empty for now; the row
   * hides the slot while it is.
   */
  why?: React.ReactNode;
}

/** Rows for the working entries, reasons taken from the finished workouts (newest first). */
export function buildLiftRows(
  working: WorkoutExerciseState[],
  finishedNewestFirst: Pick<WorkoutSession, "completedAt" | "sets">[]
): TodayLiftRow[] {
  return working.map((entry) => ({
    entry,
    name: displayLiftName(entry.substituteExerciseId ?? entry.exerciseId),
    reason: liftReason(entry, finishedNewestFirst),
  }));
}

const TIER_TERM: Partial<Record<Tier, TermId>> = {
  T1: "t1",
  T2: "t2",
  T3: "t3",
  accessory: "accessory",
  warmup: "warm-up",
};

function Reason({ reason }: { reason: LiftReason }) {
  switch (reason.kind) {
    case "up":
    case "down":
      return (
        <>
          <b className={cn("font-bold", reason.kind === "up" ? "text-success" : "text-warning")}>
            {reason.kind === "up" ? "▲" : "▼"} {formatLbs(reason.change)}
          </b>{" "}
          from {formatLbs(reason.from)}
        </>
      );
    case "held":
      return <>Held at {formatLbs(reason.weight)}</>;
    case "first":
      return <>First time</>;
  }
}

/**
 * The day's lifts, one row each: tier, name, the reason line, weight and scheme. The
 * whole row opens the lift's page, naming the home substitute when the row shows one
 * so the page shows that version; the first tier label and the first "+" open their
 * glossary entries instead.
 */
export function LiftRows({ rows }: { rows: TodayLiftRow[] }) {
  const firstPlus = rows.find((row) => row.entry.isAMRAP);
  return (
    <ul aria-label="Today's lifts" className="flex flex-col px-5 pt-2">
      {rows.map((row, index) => {
        const { entry } = row;
        const style = tierStyle(entry.tier);
        const tierTerm = index === 0 ? TIER_TERM[entry.tier] : undefined;
        const scheme = formatSetsReps(entry);
        const perHand =
          entry.substituteExerciseId && EXERCISES[entry.substituteExerciseId]?.grip === "per_hand";
        return (
          <li
            key={`${entry.tier}-${entry.exerciseId}`}
            data-testid="hero-exercise"
            className="relative grid min-h-[52px] grid-cols-[22px_minmax(0,1fr)_auto_12px] items-center gap-2.5 border-t border-border first:border-t-0"
          >
            <span className={cn("font-mono text-[11px] font-medium", style.text)}>
              {tierTerm ? (
                <Term id={tierTerm} className="relative z-10">
                  {style.label}
                </Term>
              ) : (
                style.label
              )}
            </span>
            <span className="min-w-0">
              <Link
                href={liftPageHref(entry.exerciseId, { as: entry.substituteExerciseId, from: "today" })}
                className="block truncate text-[15px] font-bold text-foreground outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
              >
                {row.name}
              </Link>
              <span data-testid="lift-reason" className="block truncate text-xs text-muted-foreground">
                <Reason reason={row.reason} />
                {row.why && (
                  <>
                    {" · "}
                    <span className="relative z-10">{row.why}</span>
                  </>
                )}
              </span>
            </span>
            <span className="text-right">
              <span className="flex items-baseline justify-end gap-0.5">
                <b className="font-display text-[26px] leading-none font-extrabold text-foreground tabular-nums">
                  {formatLbs(entry.weight)}
                </b>
                {perHand && <span className="text-[11px] text-muted-foreground">/hand</span>}
              </span>
              <span className="block font-mono text-[11px] font-medium text-muted-foreground">
                {entry === firstPlus?.entry ? (
                  <Term id="amrap-plus" className="relative z-10">
                    {scheme}
                  </Term>
                ) : (
                  scheme
                )}
              </span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </li>
        );
      })}
    </ul>
  );
}
