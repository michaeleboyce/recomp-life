"use client";

import { useWorkoutStore } from "@/stores/workoutStore";
import type { TrainingPhase } from "@/types";
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
}

/**
 * The one primary control, fixed in thumb reach at the bottom of the screen: the
 * log button, or the rest timer in the same spot while resting.
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
}: LogDockProps) {
  const isResting = useWorkoutStore((s) => s.isRestTimerActive);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-background/95 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur">
      <div className="mx-auto flex max-w-lg flex-col gap-2">
        {message && (
          <p role="alert" className="text-center text-sm text-destructive">
            {message}
          </p>
        )}
        {isResting ? (
          <RestTimer
            audioEnabled={audioEnabled}
            vibrationEnabled={vibrationEnabled}
            trainingPhase={trainingPhase}
            nextLabel={nextLabel}
          />
        ) : (
          <button
            type="button"
            onClick={onLog}
            disabled={disabled}
            className="h-16 w-full rounded-2xl bg-primary text-lg font-extrabold tracking-wide text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            LOG {reps} {reps === 1 ? "REP" : "REPS"}
          </button>
        )}
      </div>
    </div>
  );
}
