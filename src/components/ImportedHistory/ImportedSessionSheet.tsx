"use client";

import { useMemo } from "react";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { formatDateTime } from "@/components/LogEdit/format";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMappingOverrides } from "@/hooks/useMappingOverrides";
import type { ImportedSessionRecord } from "@/types";
import { ImportedTag } from "./ImportedTag";
import { importedSessionExercises, importedSessionSummary, importedSummaryLine, type ImportedSetView } from "./importedView";

const ROLE_LABEL: Partial<Record<ImportedSetView["role"], string>> = { warmup: "Warm-up", drop: "Drop set" };

/**
 * One imported session, read-only: every exercise in file order with its sets (weight
 * as lifted, reps, warm-up and drop roles, the effort word) and the library exercise
 * each name counts as now, or "Kept as its own name".
 */
export function ImportedSessionSheet({
  session,
  open,
  onOpenChange,
}: {
  session: ImportedSessionRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const overrides = useMappingOverrides();
  const summary = useMemo(() => importedSessionSummary(session, overrides), [session, overrides]);
  const exercises = useMemo(() => importedSessionExercises(session, overrides), [session, overrides]);
  const hasEffort = exercises.some((ex) => ex.sets.some((s) => s.effort !== null));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="gap-1">
          <ImportedTag />
          <SheetTitle className="text-lg">{summary.title}</SheetTitle>
          <SheetDescription>
            {formatDateTime(session.startedAt)}
            <br />
            {importedSummaryLine(summary)}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <p data-testid="imported-counts" className="rounded-lg bg-card p-3 text-[13px] text-muted-foreground">
            Imported sessions count toward your strength estimates and muscle work. They never move the workout
            rotation or GZCLP progression.
          </p>
          {session.notes.trim() && <p className="text-sm whitespace-pre-line text-foreground">{session.notes.trim()}</p>}
          {exercises.map((exercise) => (
            <section key={exercise.name} aria-label={exercise.name} className="flex flex-col">
              <h3 className="text-[15px] font-semibold text-foreground">{exercise.name}</h3>
              <p className="text-[13px] text-muted-foreground">
                {exercise.countsAs
                  ? `Counts as ${exercise.countsAs}`
                  : `Kept as its own name${exercise.muscles ? ` · ${exercise.muscles}` : ""}`}
              </p>
              <ol className="mt-1">
                {exercise.sets.map((set) => (
                  <li
                    key={set.id}
                    data-testid="imported-set"
                    className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-border py-1.5 text-sm last:border-b-0"
                  >
                    <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">{set.order}</span>
                    <span className="font-mono tabular-nums">{set.load}</span>
                    {set.amount && <span className="font-mono tabular-nums text-muted-foreground">· {set.amount}</span>}
                    {ROLE_LABEL[set.role] && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[12px] text-secondary-foreground">
                        {ROLE_LABEL[set.role]}
                      </span>
                    )}
                    {set.effort && <span className="ml-auto text-xs text-muted-foreground">{set.effort}</span>}
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {hasEffort && <EvidenceLine ruleId="import-effort-words" />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
