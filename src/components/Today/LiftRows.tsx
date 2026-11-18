"use client";

import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { useSettings } from "@/hooks";
import { EXERCISES } from "@/lib/exercises";
import type { TermId } from "@/lib/glossary";
import { tierStyle } from "@/lib/tierStyle";
import { cn } from "@/lib/utils";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import type { EquipmentProfile, Tier, WorkoutSession } from "@/types";
import { Term } from "@/components/ui/term";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { LiftWhySheet, WhyButton } from "@/components/Why";
import { formatLbs, formatSetsReps } from "./format";
import {
  atDumbbellCap,
  capNextText,
  displayLiftName,
  liftPageHref,
  liftReason,
  reasonText,
  type LiftReason,
} from "./todayModel";

/** One lift on Today: what it is, why it is at this weight, and the weight. */
export interface TodayLiftRow {
  entry: WorkoutExerciseState;
  name: string;
  reason: LiftReason;
  /**
   * Replaces the row's "why" control, which by default opens the why sheet for the
   * lift's weight (`?why=<exerciseId>:<tier>`).
   */
  why?: React.ReactNode;
}

/** Rows for the working entries, reasons taken from the finished workouts (newest first). */
export function buildLiftRows(
  working: WorkoutExerciseState[],
  finishedNewestFirst: Pick<WorkoutSession, "completedAt" | "sets" | "prescribed">[]
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
    case "capped":
      return <>Held at {formatLbs(reason.weight)}, your heaviest dumbbell</>;
    case "history":
    case "seeded":
    case "unconfirmed":
    case "notYetInApp":
      return <>{reasonText(reason)}</>;
    case "first":
      return <>First time</>;
  }
}

/**
 * The heaviest dumbbell, once the settings have loaded (the seed defaults without a
 * profile); null while loading, so a row is never called capped against a guess.
 */
function useCapEquipment(): EquipmentProfile | null {
  const settings = useSettings();
  if (settings === undefined) return null;
  return (settings ?? DEFAULT_USER_PROFILE.settings).equipment;
}

/**
 * The day's lifts, one row each: tier, name, the reason line, weight and scheme. The
 * whole row opens the lift's page, naming the home substitute when the row shows one
 * so the page shows that version; the first tier label and the first "+" open their
 * glossary entries instead. The "why" beside the reason line opens the why sheet,
 * which this list hosts; `?why=<exerciseId>:<tier>` on the page opens it too.
 * `label` names the list for screen readers ("Today's lifts" unless another day's).
 */
export function LiftRows({ rows, label = "Today's lifts" }: { rows: TodayLiftRow[]; label?: string }) {
  const firstPlus = rows.find((row) => row.entry.isAMRAP);
  const equipment = useCapEquipment();
  return (
    <>
    <ul aria-label={label} className="flex flex-col px-5 pt-2">
      {rows.map((row, index) => {
        const { entry } = row;
        const reason = equipment ? atDumbbellCap(entry, row.reason, equipment) : row.reason;
        const capNext = capNextText(reason);
        const style = tierStyle(entry.tier);
        const tierTerm = index === 0 ? TIER_TERM[entry.tier] : undefined;
        const scheme = formatSetsReps(entry);
        // The exercise shown: the home version when there is one, else the program's own lift.
        const perHand = EXERCISES[entry.substituteExerciseId || entry.exerciseId]?.grip === "per_hand";
        return (
          <li
            key={`${entry.tier}-${entry.exerciseId}`}
            data-testid="hero-exercise"
            className="relative grid min-h-[52px] grid-cols-[22px_minmax(0,1fr)_auto_12px] items-center gap-2.5 border-t border-border first:border-t-0"
          >
            <span className={cn("font-mono text-[12px] font-medium", style.text)}>
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
              <span className="flex min-w-0 items-baseline gap-1 text-xs text-muted-foreground">
                <span data-testid="lift-reason" className="min-w-0 truncate">
                  <Reason reason={reason} />
                </span>
                <span aria-hidden="true">·</span>
                {row.why ?? (
                  <WhyButton exerciseId={entry.exerciseId} tier={entry.tier} liftName={row.name} />
                )}
              </span>
              {capNext && (
                <span className="flex min-w-0 items-center gap-1">
                  <span data-testid="lift-cap-next" className="block min-w-0 truncate text-xs text-muted-foreground">
                    {capNext}
                  </span>
                  {/* Above the row's link, like the why button. */}
                  <EvidenceLine ruleId="cap-progression" variant="icon" className="z-10" />
                </span>
              )}
            </span>
            <span className="text-right">
              <span className="flex items-baseline justify-end gap-0.5">
                <b className="font-display text-[26px] leading-none font-extrabold text-foreground tabular-nums">
                  {formatLbs(entry.weight)}
                </b>
                {perHand && <span className="text-[12px] text-muted-foreground">/hand</span>}
              </span>
              <span className="block font-mono text-[12px] font-medium text-muted-foreground">
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
    {/* The sheet reads the address, so in a static build it waits in Suspense. */}
    <Suspense fallback={null}>
      <LiftWhySheet />
    </Suspense>
    </>
  );
}
