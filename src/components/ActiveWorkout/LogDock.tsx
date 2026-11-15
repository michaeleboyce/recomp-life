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
