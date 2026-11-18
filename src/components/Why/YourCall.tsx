"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { TraceAlternative } from "@/types";
import type { WeightChances } from "@/hooks";
import { formatLbs } from "@/lib/text";

const LABELS: Record<string, string> = {
  easier: "lighter",
  "the plan": "the plan",
  harder: "heavier",
};

/** 0.583 -> "58%". */
export function formatChance(probability: number): string {
  const percent = Math.round(probability * 100);
  if (percent < 1) return "under 1%";
  if (percent > 99) return "over 99%";
  return `${percent}%`;
}

/** What lifting `weight` instead of `planned` does, in the app's own terms. */
export function overrideExplanation(weight: number, planned: number, liftName: string): string {
  const what = `Lifting ${formatLbs(weight)} instead of ${formatLbs(planned)}`;
  if (weight > planned) {
    return `${what}: the app records your choice, and ${liftName.toLowerCase()} progresses from what you lift.`;
  }
  return `${what}: the sets are logged but do not count toward progression, so ${liftName.toLowerCase()} stays at ${formatLbs(planned)} for next time.`;
}

export interface YourCallProps {
  /** Lighter, the plan and heavier, from the weight trace. */
  alternatives: TraceAlternative[];
  planned: number;
  liftName: string;
  /** New-best chances by weight; `undefined` while loading. */
  chances: WeightChances | undefined;
  /** Where the weight can be changed: the Ready screen's edit flow. */
  editHref: string;
  /** Why no chance is shown, when there is none for any choice. */
  noChanceReason?: string;
}

/**
 * "Your call": one step lighter, the plan and one step heavier, each with the chance
 * of a new best where a forecast exists for it. Choosing another weight changes
 * nothing here: it says what that choice does and sends the user to the Ready screen,
 * where the workout is edited.
 */
export function YourCall({
  alternatives,
  planned,
  liftName,
  chances,
  editHref,
  noChanceReason,
}: YourCallProps) {
  const [chosen, setChosen] = useState<number | null>(null);
  const anyChance = alternatives.some((alt) => chances?.has(alt.value));
  const title = anyChance ? "Your call · chance of a new best" : "Your call";

  return (
    <section
      aria-label="Your call"
      className="rounded-2xl bg-card p-3 ring-1 ring-border dark:ring-0"
    >
      <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </p>
      <div className="grid auto-cols-fr grid-flow-col gap-2">
        {alternatives.map((alt) => {
          const isPlan = alt.value === planned;
          const chance = chances?.get(alt.value);
          const label = LABELS[alt.label] ?? alt.label;
          const selected = isPlan ? chosen === null : chosen === alt.value;
          return (
            <button
              key={`${alt.label}-${alt.value}`}
              type="button"
              aria-pressed={selected}
              aria-label={`${formatLbs(alt.value)} pounds, ${label}${
                chance !== undefined ? `, ${formatChance(chance)} chance of a new best` : ""
              }`}
              onClick={() => setChosen(isPlan ? null : alt.value)}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                isPlan
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border text-foreground",
                selected && !isPlan && "border-primary ring-2 ring-primary"
              )}
            >
              <span className="font-display text-xl leading-none font-extrabold tabular-nums">
                {formatLbs(alt.value)}
              </span>
              <span className={cn("text-xs", isPlan ? "" : "text-muted-foreground")}>
                {label}
                {chance !== undefined ? ` · ${formatChance(chance)}` : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div aria-live="polite" className="mt-2.5 text-[13px] leading-snug">
        {chosen !== null ? (
          <div className="flex flex-col gap-2">
            <p>{overrideExplanation(chosen, planned, liftName)}</p>
            <p className="text-xs text-muted-foreground">
              Changed before you start, the forecast is made for {formatLbs(chosen)}.
            </p>
            <Link
              href={editHref}
              className="flex h-11 items-center justify-center rounded-full bg-secondary px-4 text-sm font-bold text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              Change it on the Ready screen
            </Link>
          </div>
        ) : (
          <p className="text-muted-foreground">
            Changing the weight never breaks progression: tap another weight to see what it
            does, then change it on the Ready screen.
            {!anyChance && chances !== undefined && noChanceReason ? ` ${noChanceReason}` : ""}
          </p>
        )}
      </div>
    </section>
  );
}
