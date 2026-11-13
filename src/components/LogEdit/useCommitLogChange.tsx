"use client";

import { useCallback, useRef, useState, type ReactElement } from "react";
import { toast } from "@/components/ui/toast";
import { loadRebuildInput } from "@/lib/data/derived";
import { commitLogChange } from "@/lib/data/logEdits";
import { previewLogChange, type ChangePreview, type LogChange } from "@/lib/rebuild";
import { ChangePreviewSheet } from "./ChangePreviewSheet";
import { errorText, formatLbs, liftName } from "./format";
import { inverseChange } from "./inverse";

export interface SubmitOptions {
  /** Toast text once saved, for example "Set saved". */
  message: string;
  /** Saves the change; default `commitLogChange(change)`. A workout delete uses `softDelete`. */
  commit?: () => Promise<unknown>;
  /** Undoes it; default commits the inverse change, built before saving. */
  undo?: () => Promise<unknown>;
  /** Toast text after Undo; default "Change undone". */
  undoneMessage?: string;
  /** The preview sheet's confirm button; default "Save change". */
  confirmLabel?: string;
  onCommitted?: () => void;
}

/** committed: saved now. previewing: the preview sheet is open. error: nothing saved. */
export type SubmitResult = "committed" | "previewing" | "error";

interface Pending {
  change: LogChange;
  options: SubmitOptions;
  preview: ChangePreview;
  inverse: LogChange | null;
}

/** "Set saved", plus the first PR change or the e1RM count when they moved. */
export function savedMessage(message: string, preview: ChangePreview): string {
  const pr = preview.prChanges[0];
  if (pr) {
    const now = pr.after === null ? "none" : `${formatLbs(pr.after)} lbs`;
    return `${message}. ${liftName(pr.exerciseId)} best estimated 1RM is now ${now}`;
  }
  if (preview.e1rmChanges > 0) {
    const n = preview.e1rmChanges;
    return `${message}. ${n} estimated 1RM ${n === 1 ? "entry" : "entries"} updated`;
  }
  return message;
}

/**
 * The save flow for a log change: compute the preview; save at once when the next
 * workout is unchanged, otherwise open "What this changes" and save only on confirm.
 * Every save shows a toast with Undo. Render `sheet` once in the calling component.
 */
export function useCommitLogChange(): {
  submit: (change: LogChange, options: SubmitOptions) => Promise<SubmitResult>;
  busy: boolean;
  error: string | null;
  sheet: ReactElement;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const commit = useCallback(async (p: Pending) => {
    await (p.options.commit ? p.options.commit() : commitLogChange(p.change));
    p.options.onCommitted?.();
    const undo =
      p.options.undo ?? (p.inverse ? () => commitLogChange(p.inverse as LogChange) : null);
    toast({
      message: savedMessage(p.options.message, p.preview),
      action: undo
        ? {
            label: "Undo",
            onAction: async () => {
              try {
                await undo();
                toast({ message: p.options.undoneMessage ?? "Change undone" });
              } catch (e) {
                toast({ message: `Could not undo: ${errorText(e)}` });
              }
            },
          }
        : undefined,
    });
  }, []);

  const submit = useCallback(
    async (change: LogChange, options: SubmitOptions): Promise<SubmitResult> => {
      setBusy(true);
      setError(null);
      try {
        const input = await loadRebuildInput();
        const preview = previewLogChange(input, change, Date.now());
        const inverse = options.undo ? null : inverseChange(input, change);
        const p: Pending = { change, options, preview, inverse };
        if (preview.nextWorkout.length > 0) {
          setSheetError(null);
          setPending(p);
          return "previewing";
        }
        await commit(p);
        return "committed";
      } catch (e) {
        const text = errorText(e);
        setError(text);
        toast({ message: `Could not save: ${text}` });
        return "error";
      } finally {
        setBusy(false);
      }
    },
    [commit]
  );

  const confirm = useCallback(async () => {
    if (!pending || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await commit(pending);
      setPending(null);
    } catch (e) {
      setSheetError(errorText(e));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [pending, commit]);

  const sheet = (
    <ChangePreviewSheet
      open={pending !== null}
      preview={pending?.preview ?? null}
      confirmLabel={pending?.options.confirmLabel}
      saving={saving}
      error={sheetError}
      onConfirm={confirm}
      onCancel={() => setPending(null)}
    />
  );

  return { submit, busy, error, sheet };
}
