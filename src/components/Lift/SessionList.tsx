"use client";

import { useState, type ReactNode } from "react";
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
import { workoutDetailHref } from "@/lib/routes";
import { EXERCISES } from "@/lib/exercises";
import { nameInSentence } from "@/components/Today/todayModel";
import { isPerHand } from "./homeVersion";

const FIRST_PAGE = 10;

const TIER_TERM: Partial<Record<Tier, TermId>> = {
  T1: "t1",
  T2: "t2",
  T3: "t3",
};

/** "goblet squat"; "dumbbells" when the set did not record which substitute it was. */
function homeName(substituteId: string): string {
  return EXERCISES[substituteId] ? nameInSentence(substituteId) : "dumbbells";
}

/**
 * `explainTier`: this row's tier label opens its glossary entry (first row of each tier).
 * `homeOnly`: the list holds one home version only, so the row does not name it again
 * and marks a weight that is per dumbbell.
 */
function SessionRow({
  session,
  explainTier,
  homeOnly,
}: {
  session: LiftSession;
  explainTier: boolean;
  homeOnly: boolean;
}) {
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
      <span
        className={cn(
          "w-[18px] shrink-0 font-mono text-[10px] font-bold",
          style.text,
        )}
      >
        {term ? <Term id={term}>{style.label}</Term> : style.label}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-mono text-sm">
          {session.weight}
          {homeOnly && session.substituteExerciseId && isPerHand(session.substituteExerciseId) && (
            <span className="text-[11px] text-muted-foreground">/hand</span>
          )}{" "}
          ×
          {session.sets.map((set, i) => (
            <span
              key={i}
              className={cn(
                i === 0 && "ml-1",
                set.amrap && "font-bold text-accent-primary",
                set.failed && "text-warning",
              )}
              aria-label={
                set.failed
                  ? `${set.reps} reps, failed`
                  : set.amrap
                    ? `${set.reps} reps, last set as many as possible`
                    : undefined
              }
            >
              {i > 0 ? ", " : ""}
              {set.reps}
            </span>
          ))}
        </span>
        {session.substituteExerciseId && !homeOnly && (
          <span
            data-testid="session-home"
            className="truncate text-xs text-muted-foreground"
          >
            At home: {homeName(session.substituteExerciseId)}
          </span>
        )}
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
        href={workoutDetailHref(session.workoutId)}
        aria-label={`Open workout from ${formatShortDate(session.t)}`}
        className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </li>
  );
}

/**
 * Every session with this lift, newest first; the first ten, then "Show all". With
 * `empty` the list still shows, titled, when there are no sessions; without it, it
 * shows nothing. `homeOnly` when every row is the same home version.
 */
export function SessionList({
  sessions,
  title = "Sessions",
  empty,
  homeOnly = false,
}: {
  sessions: LiftSession[];
  title?: string;
  empty?: ReactNode;
  homeOnly?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  if (sessions.length === 0 && !empty) return null;
  const visible = showAll ? sessions : sessions.slice(0, FIRST_PAGE);
  return (
    <section aria-label={title}>
      <SectionHeader
        title={title}
        action={<EvidenceLine ruleId="tier-structure" variant="icon" />}
        className="mb-0.5"
      />
      {sessions.length === 0 && (
        <p data-testid="sessions-empty" className="py-2 text-sm text-muted-foreground">
          {empty}
        </p>
      )}
      <ul>
        {visible.map((s, i) => (
          <SessionRow
            key={s.key}
            session={s}
            explainTier={
              visible.findIndex((other) => other.tier === s.tier) === i
            }
            homeOnly={homeOnly}
          />
        ))}
      </ul>
      {!showAll && sessions.length > FIRST_PAGE && (
        <Button
          variant="ghost"
          className="mt-2 w-full"
          onClick={() => setShowAll(true)}
        >
          Show all {sessions.length}
        </Button>
      )}
    </section>
  );
}
