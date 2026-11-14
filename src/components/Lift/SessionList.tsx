"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatShortDate } from "@/components/chart-kit";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { tierStyle } from "@/lib/tierStyle";
import { cn } from "@/lib/utils";
import { Term } from "@/components/ui/term";
import type { TermId } from "@/lib/glossary";
import type { Tier } from "@/types";
import type { LiftSession } from "./sessions";

const FIRST_PAGE = 10;

const TIER_TERM: Partial<Record<Tier, TermId>> = { T1: "t1", T2: "t2", T3: "t3" };

/** `explainTier`: this row's tier label opens its glossary entry (first row of each tier). */
function SessionRow({ session, explainTier }: { session: LiftSession; explainTier: boolean }) {
  const style = tierStyle(session.tier);
  const term = explainTier ? TIER_TERM[session.tier] : undefined;
  return (
    <li
      data-testid="session-row"
      className="flex min-h-[52px] items-center gap-2.5 border-b border-border py-2 last:border-b-0"
    >
      <span className="w-[52px] shrink-0 font-mono text-xs text-muted-foreground">
        {formatShortDate(session.t)}
      </span>
      <span className={cn("w-[18px] shrink-0 font-mono text-[10px] font-bold", style.text)}>
        {term ? <Term id={term}>{style.label}</Term> : style.label}
      </span>
      <span className="min-w-0 flex-1 font-mono text-sm">
        {session.weight} ×
        {session.sets.map((set, i) => (
          <span
            key={i}
            className={cn(
              "ml-1",
              set.amrap && "font-bold text-accent-primary",
              set.failed && "text-warning"
            )}
            aria-label={
              set.failed
                ? `${set.reps} reps, failed`
                : set.amrap
                  ? `${set.reps} reps, last set as many as possible`
                  : undefined
            }
          >
            {set.reps}
          </span>
        ))}
      </span>
      {session.best ? (
        <span className="shrink-0 rounded-md bg-accent-primary-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-primary">
          best
        </span>
      ) : (
        session.rpe !== null && (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            RPE {Number(session.rpe.toFixed(1))}
          </span>
        )
      )}
      <Link
        href={`/log/workout/${session.workoutId}`}
        aria-label={`Open workout from ${formatShortDate(session.t)}`}
        className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** Every session with this lift, newest first; the first ten, then "Show all". */
export function SessionList({ sessions }: { sessions: LiftSession[] }) {
  const [showAll, setShowAll] = useState(false);
  if (sessions.length === 0) return null;
  const visible = showAll ? sessions : sessions.slice(0, FIRST_PAGE);
  return (
    <section aria-label="Sessions">
      <SectionHeader
        title="Sessions"
        action={<EvidenceLine ruleId="tier-structure" variant="icon" />}
        className="mb-0.5"
      />
      <ul>
        {visible.map((s, i) => (
          <SessionRow
            key={s.key}
            session={s}
            explainTier={visible.findIndex((other) => other.tier === s.tier) === i}
          />
        ))}
      </ul>
      {!showAll && sessions.length > FIRST_PAGE && (
        <Button variant="ghost" className="mt-2 w-full" onClick={() => setShowAll(true)}>
          Show all {sessions.length}
        </Button>
      )}
    </section>
  );
}
