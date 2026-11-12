"use client";

import { useState } from "react";
import { formatShortDate } from "@/components/chart-kit";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { tierStyle } from "@/lib/tierStyle";
import { cn } from "@/lib/utils";
import type { LiftSession } from "./sessions";

const FIRST_PAGE = 10;

function SessionRow({ session }: { session: LiftSession }) {
  const style = tierStyle(session.tier);
  return (
    <li
      data-testid="session-row"
      className="flex min-h-[52px] items-center gap-2.5 border-b border-border py-2 last:border-b-0"
    >
      <span className="w-[52px] shrink-0 font-mono text-xs text-muted-foreground">
        {formatShortDate(session.t)}
      </span>
      <span className={cn("w-[18px] shrink-0 font-mono text-[10px] font-bold", style.text)}>
        {style.label}
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
        {visible.map((s) => (
          <SessionRow key={s.key} session={s} />
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
