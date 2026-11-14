"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ChangePreview } from "@/lib/rebuild";
import { formatLbs, liftName, prescriptionText } from "./format";

function Change({ from, to }: { from: string; to: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 font-mono tabular-nums">
      <span>{from}</span>
      <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only"> changes to </span>
      <span className="font-semibold text-foreground">{to}</span>
    </span>
  );
}

const e1rmText = (value: number | null) => (value === null ? "no estimate" : formatLbs(value));

/** The plain-words list of what a change does; also used outside the sheet. */
export function ChangePreviewList({ preview }: { preview: ChangePreview }) {
  if (preview.unaffected) {
    return <p className="text-sm text-foreground">Nothing else changes</p>;
  }
  return (
    <ul className="flex flex-col gap-3 text-sm text-foreground">
      {preview.nextWorkout.map((c) => (
        <li key={`${c.exerciseId}:${c.tier}`} data-kind="next-workout">
          <span>
            {liftName(c.exerciseId)} {c.tier} next time:{" "}
          </span>
          <Change from={prescriptionText(c.before)} to={prescriptionText(c.after)} />
        </li>
      ))}
      {preview.prChanges.map((c) => (
        <li key={c.exerciseId} data-kind="pr">
          <span>{liftName(c.exerciseId)} best estimated 1RM: </span>
          <Change from={e1rmText(c.before)} to={e1rmText(c.after)} />
        </li>
      ))}
      {preview.e1rmChanges > 0 && (
        <li data-kind="history" className="text-muted-foreground">
          {preview.e1rmChanges === 1
            ? "1 estimated 1RM entry in your history is updated"
            : `${preview.e1rmChanges} estimated 1RM entries in your history are updated`}
        </li>
      )}
    </ul>
  );
}

/**
 * "What this changes": shown before a change that alters the next workout is saved.
 * Nothing is saved until "Save change" (or `confirmLabel`) is pressed.
 */
export function ChangePreviewSheet({
  open,
  preview,
  onConfirm,
  onCancel,
  confirmLabel = "Save change",
  saving = false,
  error = null,
}: {
  open: boolean;
  preview: ChangePreview | null;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  saving?: boolean;
  error?: string | null;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && !saving && onCancel()}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>What this changes</SheetTitle>
          <SheetDescription>Review the effect on your program before saving.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4">
          {preview && <ChangePreviewList preview={preview} />}
          {error && (
            <Callout variant="danger" title="Could not save">
              {error}
            </Callout>
          )}
        </div>
        <SheetFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button className="h-12 text-base" onClick={onConfirm} disabled={saving || !preview}>
            {saving ? "Saving..." : confirmLabel}
          </Button>
          <Button variant="ghost" className="h-12 text-base" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
