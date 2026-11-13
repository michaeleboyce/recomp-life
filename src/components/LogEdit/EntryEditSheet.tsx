"use client";

import type { ActivityLog, BodyweightLog, PainSorenessEntry, RunLog } from "@/types";
import { ActivityEditSheet } from "./ActivityEditSheet";
import { PainEditSheet } from "./PainEditSheet";
import { RunEditSheet } from "./RunEditSheet";
import { WeighInEditSheet } from "./WeighInEditSheet";

export type EditableEntry =
  | { table: "runs"; row: RunLog }
  | { table: "activities"; row: ActivityLog }
  | { table: "bodyweight"; row: BodyweightLog }
  | { table: "painEntries"; row: PainSorenessEntry };

/** Edit or delete any non-workout log entry: picks the sheet for its table. */
export function EntryEditSheet({
  entry,
  open,
  onOpenChange,
  now,
}: {
  entry: EditableEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  now?: Date;
}) {
  const common = { open, onOpenChange, now };
  switch (entry.table) {
    case "runs":
      return <RunEditSheet {...common} entry={entry.row} />;
    case "activities":
      return <ActivityEditSheet {...common} entry={entry.row} />;
    case "bodyweight":
      return <WeighInEditSheet {...common} entry={entry.row} />;
    case "painEntries":
      return <PainEditSheet {...common} entry={entry.row} />;
  }
}
