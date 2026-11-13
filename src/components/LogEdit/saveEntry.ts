// Saving an edit to a run, activity, weigh-in or pain entry, with Undo in the toast.
import { toast } from "@/components/ui/toast";
import { errorText } from "./format";

/** The fields of `row` that `patch` touches, as they are now: the patch that undoes it. */
export function previousValues<T extends object>(row: T, patch: Partial<T>): Partial<T> {
  const before: Partial<T> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) before[key] = row[key];
  return before;
}

/** Only the fields whose value differs from `row` (dates compared by time). */
export function changedFields<T extends object>(row: T, next: Partial<T>): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(next) as (keyof T)[]) {
    const a = row[key] as unknown;
    const b = next[key] as unknown;
    const same =
      a instanceof Date || b instanceof Date
        ? new Date(a as Date).getTime() === new Date(b as Date).getTime()
        : a === b;
    if (!same) out[key] = next[key];
  }
  return out;
}

/**
 * Writes `patch` with `update`, then shows "<label> saved" with Undo. Returns false and
 * shows the error when the write fails.
 */
export async function saveEntryWithUndo<T extends object>(
  update: (id: string, patch: Partial<T>) => Promise<void>,
  id: string,
  row: T,
  patch: Partial<T>,
  label: string
): Promise<boolean> {
  if (Object.keys(patch).length === 0) return true;
  const before = previousValues(row, patch);
  try {
    await update(id, patch);
  } catch (e) {
    toast({ message: `Could not save: ${errorText(e)}` });
    return false;
  }
  toast({
    message: `${label} saved`,
    action: {
      label: "Undo",
      onAction: async () => {
        try {
          await update(id, before);
          toast({ message: "Change undone" });
        } catch (e) {
          toast({ message: `Could not undo: ${errorText(e)}` });
        }
      },
    },
  });
  return true;
}

/** Parses an optional non-negative number; undefined when invalid. */
export function optionalNumber(text: string): number | null | undefined {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export interface EntrySheetProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: T;
  now?: Date;
}
