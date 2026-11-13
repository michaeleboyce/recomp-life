"use client";

import { useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { useWorkoutStore } from "@/stores/workoutStore";
import { TimerWorkerManager } from "@/lib/timerWorker";
import { playTimerChime, vibrateTimer, sendTimerNotification } from "@/lib/audio";
import {
  hasCuttingRestBonus,
  formatRestDuration,
  getRestEvidenceId,
} from "@/lib/restTimes";
import type { TrainingPhase } from "@/types";

/** Small top-ups to the remaining rest. */
const EXTEND_SECONDS = [5, 15] as const;

interface RestTimerProps {
  audioEnabled?: boolean;
  vibrationEnabled?: boolean;
  /** User's current training phase: shows the cutting rest bonus when it applied. */
  trainingPhase?: TrainingPhase;
  /** What comes after the rest, e.g. "Next: set 3 of 5 · 190 lbs". */
  nextLabel?: string;
}

/**
 * The rest between sets, shown where the log button was. Counts down, can be
 * extended or skipped, and hands the spot back to the log button when it ends
 * (with the chime, vibration and notification the settings allow).
 */
export function RestTimer({
  audioEnabled = false,
  vibrationEnabled = false,
  trainingPhase,
  nextLabel,
}: RestTimerProps) {
  const isRestTimerActive = useWorkoutStore((s) => s.isRestTimerActive);
  const restTimeRemaining = useWorkoutStore((s) => s.restTimeRemaining);
  const restTimerDuration = useWorkoutStore((s) => s.restTimerDuration);
  const tier = useWorkoutStore((s) => s.restTier);
  const skipRest = useWorkoutStore((s) => s.skipRest);
  const addRestTime = useWorkoutStore((s) => s.addRestTime);

  const managerRef = useRef<TimerWorkerManager | null>(null);

  const getManager = useCallback(() => {
    if (!managerRef.current) {
      managerRef.current = new TimerWorkerManager();
    }
    return managerRef.current;
  }, []);

  // Start / stop the Web Worker timer when rest starts or ends.
  useEffect(() => {
    if (!isRestTimerActive) {
      managerRef.current?.stop();
      return;
    }
    const duration = useWorkoutStore.getState().restTimerDuration;
    if (duration <= 0) return;
    getManager().start(
      duration,
      (remaining) => useWorkoutStore.setState({ restTimeRemaining: remaining }),
      () => {}
    );
  }, [isRestTimerActive, getManager]);

  // Rest is over: let the user know, then give the spot back to the log button.
  useEffect(() => {
    if (!isRestTimerActive || restTimeRemaining > 0) return;
    if (audioEnabled) playTimerChime();
    if (vibrationEnabled) vibrateTimer();
    if (document.visibilityState === "hidden") sendTimerNotification();
    managerRef.current?.stop();
    skipRest();
  }, [isRestTimerActive, restTimeRemaining, audioEnabled, vibrationEnabled, skipRest]);

  useEffect(() => {
    return () => {
      managerRef.current?.stop();
    };
  }, []);

  const handleAddTime = useCallback(
    (seconds: number) => {
      addRestTime(seconds);
      getManager().addTime(seconds);
    },
    [addRestTime, getManager]
  );

  const handleSkip = useCallback(() => {
    managerRef.current?.stop();
    skipRest();
  }, [skipRest]);

  if (!isRestTimerActive) return null;

  const elapsed = restTimerDuration - restTimeRemaining;
  const progressPercent =
    restTimerDuration > 0
      ? Math.min(100, Math.max(0, (elapsed / restTimerDuration) * 100))
      : 100;

  // Why the rest is this long (heavy vs lighter sets); none for warm-ups.
  const restEvidenceId = tier ? getRestEvidenceId(tier) : null;
  const hasCuttingBonus = !!tier && hasCuttingRestBonus(tier, trainingPhase);

  return (
    <div
      role="timer"
      aria-label="Rest timer"
      className="flex flex-col gap-2 rounded-2xl bg-card px-4 py-3"
    >
      {/* "Rest", what it is out of, and why it is this long. */}
      <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span data-testid="rest-label">Rest</span>
        <span className="font-mono font-normal normal-case tracking-normal tabular-nums">
          of {formatRestDuration(restTimerDuration)}
        </span>
        {restEvidenceId && (
          <EvidenceLine ruleId={restEvidenceId} variant="icon" hideLibraryLink />
        )}
        {hasCuttingBonus && (
          <span className="inline-flex items-center gap-1 normal-case tracking-normal text-info">
            +30s cut
            <EvidenceLine ruleId="rest-cut-bonus" variant="icon" hideLibraryLink />
          </span>
        )}
      </span>

      <div className="flex items-center gap-2">
        {/* The remaining time is the largest thing in the dock. */}
        <span
          data-testid="rest-remaining"
          className="min-w-0 flex-1 font-mono text-4xl font-bold leading-none tabular-nums"
        >
          {formatRestDuration(restTimeRemaining)}
        </span>
        {EXTEND_SECONDS.map((seconds) => (
          <Button
            key={seconds}
            variant="outline"
            className="h-11 min-w-11 px-3 font-mono"
            onClick={() => handleAddTime(seconds)}
          >
            +{seconds}s
          </Button>
        ))}
        <Button variant="secondary" className="h-11 px-3.5" onClick={handleSkip}>
          Skip rest
        </Button>
      </div>

      <Progress value={progressPercent} className="h-1" />

      {nextLabel && (
        <p className="font-mono text-[13px] tabular-nums text-muted-foreground">{nextLabel}</p>
      )}
    </div>
  );
}
