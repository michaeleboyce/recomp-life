// Hooks for editing the log: a live preview of a change, the "Recently deleted" list and
// the derived-data check. The engine is pure (`@/lib/rebuild`); reads and writes go
// through `@/lib/data`.
import { useCallback, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { previewLogChange, type ChangePreview, type DerivedDiff, type LogChange } from "@/lib/rebuild";
import { applyRebuild, checkDerived, loadRebuildInput } from "@/lib/data/derived";
import { listDeleted, type DeletedItem } from "@/lib/data/logEdits";

/** A stable key for a change: callers may pass a new object with the same content each render. */
function changeKey(change: LogChange | null): string {
  return change ? JSON.stringify(change) : "";
}

/**
 * What `change` would do to the next workout, PRs and e1RM history. Recomputes when the
 * change or the log changes; `undefined` while loading or when `change` is null.
 */
export function useLogChangePreview(change: LogChange | null): ChangePreview | undefined {
  const key = changeKey(change);
  // The key carries the change's content, so the memo is keyed on it rather than identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => change, [key]);
  const preview = useLiveQuery(
    async () => (stable ? previewLogChange(await loadRebuildInput(), stable, Date.now()) : null),
    [stable]
  );
  return preview ?? undefined;
}

/** Soft-deleted entries from the last 30 days, newest delete first; live. */
export function useRecentlyDeleted(): DeletedItem[] | undefined {
  return useLiveQuery(() => listDeleted(), []);
}

export type DerivedCheckStatus =
  | "idle"
  | "checking"
  | "consistent"
  | "inconsistent"
  | "rebuilding"
  | "rebuilt"
  | "error";

export interface DerivedCheck {
  status: DerivedCheckStatus;
  /** Rows that differ from the log (after a check) or were rewritten (after a rebuild). */
  differences: number;
  error: string | null;
  run: () => Promise<void>;
  rebuild: () => Promise<void>;
}

/** Lift-state and e1RM rows a diff would add, change or remove. */
export function countDifferences(diff: DerivedDiff): number {
  return (
    diff.liftStatesToPut.length +
    diff.liftStateIdsToDelete.length +
    diff.e1rmsToPut.length +
    diff.e1rmIdsToDelete.length
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** "Check derived data" and "Rebuild from log", with their progress and result. */
export function useDerivedCheck(): DerivedCheck {
  const [status, setStatus] = useState<DerivedCheckStatus>("idle");
  const [differences, setDifferences] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setStatus("checking");
    setError(null);
    try {
      const diff = await checkDerived();
      setDifferences(countDifferences(diff));
      setStatus(diff.consistent ? "consistent" : "inconsistent");
    } catch (e) {
      setError(message(e));
      setStatus("error");
    }
  }, []);

  const rebuild = useCallback(async () => {
    setStatus("rebuilding");
    setError(null);
    try {
      const diff = await applyRebuild();
      setDifferences(countDifferences(diff));
      setStatus("rebuilt");
    } catch (e) {
      setError(message(e));
      setStatus("error");
    }
  }, []);

  return { status, differences, error, run, rebuild };
}
