"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatShortDate } from "@/components/chart-kit";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { ImportedSessionSheet } from "@/components/ImportedHistory/ImportedSessionSheet";
import { ImportedTag } from "@/components/ImportedHistory/ImportedTag";
import { formatLbs } from "@/components/LogEdit/format";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { tierStyle } from "@/lib/tierStyle";
import { cn } from "@/lib/utils";
import { Term } from "@/components/ui/term";
import type { TermId } from "@/lib/glossary";
import type { ImportedSessionRecord, Tier } from "@/types";
import type { ImportedLiftSession, LiftSession } from "./sessions";
import { workoutDetailHref } from "@/lib/routes";
import { EXERCISES } from "@/lib/exercises";
import { displayLiftName, nameInSentence } from "@/components/Today/todayModel";
import { isPerHand } from "./homeVersion";
import { useImportedLiftSessions } from "./useImportedLiftSessions";

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
          "w-[18px] shrink-0 font-mono text-[12px] font-bold",
          style.text,
        )}
      >
        {term ? <Term id={term}>{style.label}</Term> : style.label}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-mono text-sm">
          {session.weight}
          {homeOnly && session.substituteExerciseId && isPerHand(session.substituteExerciseId) && (
            <span className="text-[12px] text-muted-foreground">/hand</span>
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
        <span className="shrink-0 rounded-md bg-accent-primary-soft px-1.5 py-0.5 text-[12px] font-medium text-accent-primary">
          best
        </span>
      ) : (
        session.meanRepsInReserve !== null && (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {Number(session.meanRepsInReserve.toFixed(1))} left
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
 * A session imported from another app: its weight as lifted and reps, labelled
 * "Imported" with the app (and the exercise, when it is a home version of the list's
 * lift). It has no tier and no workout page; its button opens the read-only detail.
 */
function ImportedRow({
  row,
  homeOnly,
  onOpen,
}: {
  row: ImportedLiftSession;
  homeOnly: boolean;
  onOpen: (session: ImportedSessionRecord) => void;
}) {
  const date = formatShortDate(row.t);
  // Imported history goes back years: a row from another year says which.
  const year = new Date(row.t).getFullYear();
  const otherYear = year !== new Date().getFullYear();
  return (
    <li
      data-testid="session-row"
      data-imported="true"
      className="flex min-h-[52px] items-center gap-2.5 border-b border-border py-2 last:border-b-0"
    >
      <span className="w-[52px] shrink-0 font-mono text-xs leading-tight text-muted-foreground">
        {date}
        {otherYear && <span className="block">{year}</span>}
      </span>
      <span className="w-[18px] shrink-0" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-mono text-sm">
          {row.weight > 0 ? formatLbs(row.weight) : "BW"}
          {row.weight > 0 && row.perHand && <span className="text-[12px] text-muted-foreground">/hand</span>}{" "}
          ×
          {row.sets.map((set, i) => (
            <span
              key={i}
              className={cn(i === 0 && "ml-1", set.drop && "text-muted-foreground")}
              aria-label={set.drop ? `${set.reps} reps, drop set` : undefined}
            >
              {i > 0 ? ", " : ""}
              {set.reps}
            </span>
          ))}
        </span>
        <span data-testid="session-imported" className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <ImportedTag />
          <span className="truncate">
            {row.source}
            {row.isVariant && !homeOnly ? ` · ${displayLiftName(row.exerciseId)}` : ""}
          </span>
        </span>
      </span>
      <button
        type="button"
        onClick={() => onOpen(row.session)}
        aria-label={`Open imported session from ${date}${otherYear ? `, ${year}` : ""}`}
        className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

type Row = { imported: false; t: number; key: string; row: LiftSession } | { imported: true; t: number; key: string; row: ImportedLiftSession };

interface SessionListProps {
  sessions: LiftSession[];
  title?: string;
  empty?: ReactNode;
  homeOnly?: boolean;
  /** Imported rows to list among the sessions (see `importedLiftSessions`); `importedFor` reads them instead. */
  imported?: ImportedLiftSession[];
}

/**
 * Every session with this lift, newest first; the first ten, then "Show all". With
 * `empty` the list still shows, titled, when there are no sessions; without it, it
 * shows nothing. `homeOnly` when every row is the same home version.
 *
 * With `importedFor` (the list's exercise first, then any it groups under it, e.g.
 * `importedPoolFor(lift)`), sessions imported from other apps whose sets count as one
 * of them are listed too, by date and labelled, with a control to hide them. They are
 * listed only: nothing the page works out from its sessions reads them from here.
 */
export function SessionList({ importedFor, ...props }: SessionListProps & { importedFor?: readonly string[] }) {
  return importedFor ? <SessionListReadingImported importedFor={importedFor} {...props} /> : <SessionListView {...props} />;
}

const NO_IMPORTED: ImportedLiftSession[] = [];

function SessionListReadingImported({ importedFor, ...props }: SessionListProps & { importedFor: readonly string[] }) {
  const imported = useImportedLiftSessions(importedFor);
  return <SessionListView {...props} imported={imported ?? NO_IMPORTED} />;
}

function SessionListView({ sessions, title = "Sessions", empty, homeOnly = false, imported = NO_IMPORTED }: SessionListProps) {
  const [showAll, setShowAll] = useState(false);
  const [hideImported, setHideImported] = useState(false);
  const [viewing, setViewing] = useState<ImportedSessionRecord | null>(null);

  const rows = useMemo<Row[]>(() => {
    const own: Row[] = sessions.map((row) => ({ imported: false, t: row.t, key: row.key, row }));
    if (hideImported || imported.length === 0) return own;
    const other: Row[] = imported.map((row) => ({ imported: true, t: row.t, key: row.key, row }));
    // Stable: the app's own row first when an imported one has the same start.
    return [...own, ...other].sort((a, b) => b.t - a.t);
  }, [sessions, imported, hideImported]);
  const importedCount = useMemo(() => new Set(imported.map((r) => r.session.id)).size, [imported]);

  if (sessions.length === 0 && importedCount === 0 && !empty) return null;
  const visible = showAll ? rows : rows.slice(0, FIRST_PAGE);
  const sessionsWord = importedCount === 1 ? "session" : "sessions";
  return (
    <section aria-label={title}>
      <SectionHeader
        title={title}
        action={<EvidenceLine ruleId="tier-structure" variant="icon" />}
        className="mb-0.5"
      />
      {importedCount > 0 && (
        <div data-testid="imported-control" className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-xs text-muted-foreground">
            {hideImported
              ? `${importedCount} imported ${sessionsWord} hidden`
              : `Includes ${importedCount} imported ${sessionsWord}`}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 min-h-11 text-accent-primary"
            onClick={() => setHideImported((hidden) => !hidden)}
          >
            {hideImported ? "Show imported" : "Hide imported"}
          </Button>
        </div>
      )}
      {sessions.length === 0 && importedCount === 0 && (
        <p data-testid="sessions-empty" className="py-2 text-sm text-muted-foreground">
          {empty}
        </p>
      )}
      <ul>
        {visible.map((entry, i) =>
          entry.imported ? (
            <ImportedRow key={entry.key} row={entry.row} homeOnly={homeOnly} onOpen={setViewing} />
          ) : (
            <SessionRow
              key={entry.key}
              session={entry.row}
              explainTier={
                visible.findIndex((other) => !other.imported && other.row.tier === entry.row.tier) === i
              }
              homeOnly={homeOnly}
            />
          )
        )}
      </ul>
      {!showAll && rows.length > FIRST_PAGE && (
        <Button
          variant="ghost"
          className="mt-2 w-full"
          onClick={() => setShowAll(true)}
        >
          Show all {rows.length}
        </Button>
      )}
      {viewing && (
        <ImportedSessionSheet
          key={viewing.id}
          session={viewing}
          open
          onOpenChange={(isOpen) => !isOpen && setViewing(null)}
        />
      )}
    </section>
  );
}
