"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { toast } from "@/components/ui/toast";
import {
  listImportBatches,
  restoreImportBatch,
  undoImportBatch,
  type ImportBatchCounts,
  type ImportBatchSummary,
} from "@/lib/data/imported";
import { SOURCE_APP_NAMES } from "@/lib/import/records";
import { pluralGrouped } from "@/lib/text";

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });
const DAY = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "832 sessions (11,708 sets), 265 runs, 299 activities": the parts that are not zero. */
export function batchCountsText(counts: ImportBatchCounts & { sets?: number }): string {
  const parts: string[] = [];
  if (counts.sessions > 0) {
    parts.push(
      counts.sets !== undefined
        ? `${pluralGrouped(counts.sessions, "session")} (${pluralGrouped(counts.sets, "set")})`
        : pluralGrouped(counts.sessions, "session")
    );
  }
  if (counts.runs > 0) parts.push(pluralGrouped(counts.runs, "run"));
  if (counts.activities > 0) parts.push(pluralGrouped(counts.activities, "activity", "activities"));
  return parts.length > 0 ? parts.join(", ") : "nothing";
}

const total = (counts: ImportBatchCounts) => counts.sessions + counts.runs + counts.activities;

/** "Fitbod import, Nov 16, 2026", "Gravl import" when the day is not known. */
export function batchTitle(batch: Pick<ImportBatchSummary, "sourceApp" | "importedOn" | "batchId">): string {
  const app = batch.sourceApp ? SOURCE_APP_NAMES[batch.sourceApp] : "Cardio";
  const kind = batch.batchId.startsWith("preload-") ? "history preload" : "import";
  const day = batch.importedOn ? DAY.format(new Date(`${batch.importedOn}T00:00:00Z`)) : null;
  return day ? `${app} ${kind}, ${day}` : `${app} ${kind}`;
}

function rangeText(batch: Pick<ImportBatchSummary, "from" | "to">): string | null {
  if (!batch.from || !batch.to) return null;
  const from = MONTH.format(batch.from);
  const to = MONTH.format(batch.to);
  return from === to ? `Sessions from ${from}` : `Sessions from ${from} to ${to}`;
}

/**
 * Every import from another app's export, the history preload included, with what it
 * added: one that is in the log can be undone as a whole, one that was undone can be
 * restored. Imports sync, so every device lists and undoes the same ones.
 */
export function ImportBatches() {
  const batches = useLiveQuery(() => listImportBatches(), []);
  const [busy, setBusy] = useState<string | null>(null);

  if (!batches || batches.length === 0) return null;

  async function run(batch: ImportBatchSummary, action: "undo" | "restore") {
    setBusy(batch.batchId);
    const title = batchTitle(batch);
    try {
      if (action === "undo") {
        const undone = await undoImportBatch(batch.batchId);
        toast({
          message: `${title} undone: ${batchCountsText(undone)} removed`,
          action: { label: "Restore", onAction: () => run(batch, "restore") },
        });
      } else {
        const restored = await restoreImportBatch(batch.batchId);
        toast({ message: `${title} restored: ${batchCountsText(restored)}` });
      }
    } catch {
      toast({ message: action === "undo" ? "Could not undo the import. Nothing was changed." : "Could not restore the import." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label="Imports" className="flex flex-col">
      <SectionHeader as="h3" title="Imports" />
      <ul className="flex flex-col">
        {batches.map((batch) => {
          const title = batchTitle(batch);
          const live = total(batch.live) > 0;
          const range = rangeText(batch);
          return (
            <li
              key={batch.batchId}
              className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0"
              data-testid="import-batch"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold text-foreground">{title}</span>
                {range && <span className="text-[13px] text-muted-foreground">{range}</span>}
                {live && <span className="text-[13px] text-muted-foreground">In the log: {batchCountsText(batch.live)}</span>}
                {total(batch.undone) > 0 && (
                  <span className="text-[13px] text-muted-foreground">Undone: {batchCountsText(batch.undone)}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {live && (
                  <Button
                    variant="outline"
                    className="h-11"
                    disabled={busy === batch.batchId}
                    onClick={() => void run(batch, "undo")}
                    aria-label={`Undo ${title}`}
                  >
                    Undo import
                  </Button>
                )}
                {total(batch.undone) > 0 && (
                  <Button
                    variant="outline"
                    className="h-11"
                    disabled={busy === batch.batchId}
                    onClick={() => void run(batch, "restore")}
                    aria-label={`Restore ${title}`}
                  >
                    Restore
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
