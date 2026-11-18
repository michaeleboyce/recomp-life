"use client";

import { useState } from "react";
import { Check, ChevronDown, Clock } from "lucide-react";
import {
  SESSION_MINUTE_CHOICES,
  lengthAgainstTarget,
  sessionMinutesLabel,
  type SessionMinutes,
} from "@/lib/accessories/sessionBudget";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import type { ReadyLength } from "./useReadyLength";

/** Every length offered: the minutes, then no limit. */
const CHOICES: SessionMinutes[] = [...SESSION_MINUTE_CHOICES, null];

interface TimeEstimateProps {
  /**
   * From `useReadyLength`: the session-length forecast Today shows, for this screen's
   * own plan (warm-ups, accessories and edits included), with its range.
   */
  length: ReadyLength;
  /** The session length planned for (null: no limit); left out, the line is plain text. */
  target?: SessionMinutes;
  /** The length in Settings: "Make this my usual length" shows when `target` differs. */
  usual?: SessionMinutes;
  /** A length for this workout only (the accessories are planned again). */
  onTarget?: (minutes: SessionMinutes) => void;
  /** Saves `target` as the usual length. */
  onSaveUsual?: (minutes: SessionMinutes) => void | Promise<void>;
}

/**
 * "About 58 of 60 min (50 to 65), rests included": the forecast against the session
 * length planned for. With `onTarget` the line opens a chooser for this workout's
 * length, with a way to make it the usual one.
 */
export function TimeEstimate({ length, target, usual, onTarget, onSaveUsual }: TimeEstimateProps) {
  const [open, setOpen] = useState(false);
  const range =
    length.low !== undefined && length.high !== undefined && length.high > length.low
      ? ` (${length.low} to ${length.high})`
      : "";
  const text =
    target === undefined
      ? `About ${length.minutes} min${range}, rests included`
      : `${lengthAgainstTarget(length.minutes, target)}${range}, rests included`;

  if (!onTarget || target === undefined) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="ready-length">
        <Clock className="size-4" aria-hidden="true" />
        <span>{text}</span>
      </p>
    );
  }

  const choose = (minutes: SessionMinutes) => {
    onTarget(minutes);
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${text}. Change the session length`}
        data-testid="ready-length"
        className="flex min-h-11 items-center gap-1.5 rounded-md text-left text-sm text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Clock className="size-4 shrink-0" aria-hidden="true" />
        <span className="underline decoration-dotted underline-offset-4">{text}</span>
        <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto flex max-w-lg flex-col gap-0 rounded-t-3xl border-border bg-card px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+20px)]"
        >
          <SheetTitle className="pr-10 text-lg">Session length</SheetTitle>
          <SheetDescription className="mb-3 text-sm text-muted-foreground">
            For this workout. The accessories are planned again to fit; the main lifts stay as they are.
          </SheetDescription>
          <div role="radiogroup" aria-label="Session length" className="grid grid-cols-3 gap-2">
            {CHOICES.map((minutes) => {
              const selected = minutes === target;
              return (
                <button
                  key={minutes ?? "none"}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => choose(minutes)}
                  className={cn(
                    "inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    selected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-input bg-background text-muted-foreground"
                  )}
                >
                  {selected && <Check className="size-4" aria-hidden="true" />}
                  {sessionMinutesLabel(minutes)}
                </button>
              );
            })}
          </div>
          {onSaveUsual && usual !== undefined && target !== usual && (
            <Button
              variant="outline"
              className="mt-3 min-h-11"
              onClick={() => {
                void onSaveUsual(target);
                setOpen(false);
              }}
            >
              Make {sessionMinutesLabel(target).toLowerCase()} my usual length
            </Button>
          )}
          {usual !== undefined && target === usual && (
            <p data-testid="usual-length" className="mt-3 text-[13px] text-muted-foreground">
              This is your usual length. Change it here or in Settings.
            </p>
          )}
          <div className="mt-3 border-t border-border pt-3">
            <EvidenceLine ruleId="session-length-budget" />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
