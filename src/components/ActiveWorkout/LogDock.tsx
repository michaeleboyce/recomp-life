"use client";

import type { ReactNode } from "react";
import { useWorkoutStore } from "@/stores/workoutStore";
import type { DecisionTrace, TrainingPhase } from "@/types";
import { RestTimer } from "./RestTimer";

interface LogDockProps {
  reps: number;
  onLog: () => void;
  disabled?: boolean;
  audioEnabled: boolean;
  vibrationEnabled: boolean;
  trainingPhase: TrainingPhase;
  /** Shown under the countdown while resting. */
  nextLabel: string;
  /** A short message above the control (for example a failed save). */
  message?: string | null;
  /** While resting: why the rest is this long (the trace saved at start). */
  restWhy?: DecisionTrace | null;
  /** While resting: how the set just logged compared with its forecast. */
  restBanner?: ReactNode;
  /** While resting: what comes next, as a card. */
  restUpNext?: ReactNode;
  /** While resting: go straight on from the set just logged at a lighter weight. */
  onDropSet?: () => void;
  /** The drop button's words, e.g. "Drop to 150 lbs". */
  dropSetLabel?: string;
}

/** The rest screen's drop button: one tap goes on from the set at a lighter weight. */
export function DropSetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-14 w-full shrink-0 rounded-full border-[1.5px] border-primary font-display text-[17px] leading-none font-extrabold tracking-[0.12em] text-foreground uppercase transition-colors active:bg-card"
    >
      <span aria-hidden="true">↳ </span>
      {label}
    </button>
  );
}

/**
 * The one primary control, fixed in thumb reach at the bottom of the screen: the
 * log button, or, while resting, the rest screen over the set.
 */
export function LogDock({
  reps,
  onLog,
  disabled = false,
  audioEnabled,
  vibrationEnabled,
  trainingPhase,
  nextLabel,
  message,
  restWhy,
  restBanner,
  restUpNext,
  onDropSet,
  dropSetLabel,
}: LogDockProps) {
  const isResting = useWorkoutStore((s) => s.isRestTimerActive);

  if (isResting) {
    return (
      <div className="fixed inset-0 z-40 overflow-y-auto bg-background">
        <div className="mx-auto flex min-h-full max-w-lg flex-col gap-2 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {message && (
            <p role="alert" className="text-center text-sm text-destructive">
              {message}
            </p>
          )}
          <RestTimer
            audioEnabled={audioEnabled}
            vibrationEnabled={vibrationEnabled}
            trainingPhase={trainingPhase}
            nextLabel={nextLabel}
            why={restWhy}
            banner={restBanner}
            upNext={restUpNext}
            action={
              onDropSet && dropSetLabel ? (
                <DropSetButton label={dropSetLabel} onClick={onDropSet} />
              ) : undefined
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-background/95 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur">
      <div className="mx-auto flex max-w-lg flex-col gap-2">
        {message && (
          <p role="alert" className="text-center text-sm text-destructive">
            {message}
          </p>
        )}
        <button
          type="button"
          onClick={onLog}
          disabled={disabled}
          className="h-[62px] w-full rounded-full bg-primary font-display text-[21px] leading-none font-extrabold tracking-[0.14em] text-primary-foreground uppercase transition-transform active:scale-[0.99] disabled:opacity-60"
        >
          LOG {reps} {reps === 1 ? "REP" : "REPS"}
        </button>
      </div>
    </div>
  );
}
