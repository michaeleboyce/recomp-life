"use client";

import { useCallback, useState, type ReactElement } from "react";
import { toast } from "@/components/ui/toast";
import { restore, softDelete, type LogTable } from "@/lib/data/logEdits";
import { errorText } from "./format";
import { useCommitLogChange, type SubmitResult } from "./useCommitLogChange";

/**
 * Deletes a log entry with Undo in the toast. A workout goes through the save flow first
 * (as a `deleteWorkout` change), so the preview opens when the next workout changes.
 * Render `sheet` once in the calling component.
 */
export function useDeleteWithUndo(): {
  deleteEntry: (
    table: LogTable,
    id: string,
    label: string,
    onDeleted?: () => void
  ) => Promise<SubmitResult>;
  busy: boolean;
  sheet: ReactElement;
} {
  const { submit, busy: flowBusy, sheet } = useCommitLogChange();
  const [busy, setBusy] = useState(false);

  const deleteEntry = useCallback(
    async (table: LogTable, id: string, label: string, onDeleted?: () => void) => {
      const undo = async () => {
        await restore(table, id);
      };
      const undoneMessage = `${label} restored`;

      if (table === "workouts") {
        return submit(
          { kind: "deleteWorkout", workoutId: id },
          {
            message: `${label} deleted`,
            commit: () => softDelete(table, id),
            undo,
            undoneMessage,
            confirmLabel: "Delete workout",
            onCommitted: onDeleted,
          }
        );
      }

      setBusy(true);
      try {
        await softDelete(table, id);
        onDeleted?.();
        toast({
          message: `${label} deleted`,
          action: {
            label: "Undo",
            onAction: async () => {
              try {
                await undo();
                toast({ message: undoneMessage });
              } catch (e) {
                toast({ message: `Could not undo: ${errorText(e)}` });
              }
            },
          },
        });
        return "committed" as const;
      } catch (e) {
        toast({ message: `Could not delete: ${errorText(e)}` });
        return "error" as const;
      } finally {
        setBusy(false);
      }
    },
    [submit]
  );

  return { deleteEntry, busy: busy || flowBusy, sheet };
}
