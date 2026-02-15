"use client";

import { useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useWorkoutStore } from "@/stores/workoutStore";
import { TimerWorkerManager } from "@/lib/timerWorker";
import { playTimerChime, vibrateTimer, sendTimerNotification } from "@/lib/audio";
import type { Tier, TrainingPhase } from "@/types";

/** Base rest durations per tier (seconds) before phase adjustments */
const BASE_REST_SECONDS: Record<Tier, number> = {
  T1: 180,
  T2: 120,
  T3: 60,
  accessory: 60,
  warmup: 60,
};

/** Tiers that receive +30s during a cutting phase */
const CUTTING_BONUS_TIERS: Set<Tier> = new Set(["T1", "T2"]);
const CUTTING_BONUS_SECONDS = 30;

/**
 * Compute the default rest duration for a tier, adding +30s for T1/T2
 * when the user is in a cutting phase.
 */
export function getPhaseAdjustedRest(tier: Tier, phase?: TrainingPhase): number {
  const base = BASE_REST_SECONDS[tier] ?? 60;
  if (phase?.mode === "cutting" && CUTTING_BONUS_TIERS.has(tier)) {
    return base + CUTTING_BONUS_SECONDS;
  }
  return base;
}

interface RestTimerProps {
  audioEnabled?: boolean;
  vibrationEnabled?: boolean;
  /** Current tier for the exercise being rested after */
  tier?: Tier;
  /** User's current training phase — used to show the cutting rest bonus indicator */
  trainingPhase?: TrainingPhase;
}

export function RestTimer({
  audioEnabled = false,
  vibrationEnabled = false,
  tier,
  trainingPhase,
}: RestTimerProps) {
  const {
    isRestTimerActive,
    restTimeRemaining,
    restTimerDuration,
    skipRest,
    addRestTime,
  } = useWorkoutStore();

  const managerRef = useRef<TimerWorkerManager | null>(null);
  const hasNotifiedRef = useRef(false);

  // Lazily initialize the manager
  const getManager = useCallback(() => {
    if (!managerRef.current) {
      managerRef.current = new TimerWorkerManager();
    }
    return managerRef.current;
  }, []);

  // Reset notification flag when a new rest timer starts
  useEffect(() => {
    if (isRestTimerActive && restTimeRemaining > 0) {
      hasNotifiedRef.current = false;
    }
  }, [isRestTimerActive, restTimerDuration]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start / stop the Web Worker timer when rest state changes
  useEffect(() => {
    if (isRestTimerActive && restTimerDuration > 0) {
      const manager = getManager();

      const onTick = (remaining: number) => {
        // Update the store with the worker's authoritative remaining time
        useWorkoutStore.setState({ restTimeRemaining: remaining });
      };

      const onComplete = () => {
        // Timer hit zero — the worker keeps ticking into overtime
        // so the UI continues to show +0:XX. No action needed here;
        // the tick callback handles the negative remaining values.
      };

      manager.start(restTimerDuration, onTick, onComplete);
    } else {
      // Timer was deactivated (skip or natural stop)
      managerRef.current?.stop();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRestTimerActive]);

  // Fire audio/haptics/notification when the timer reaches 0
  useEffect(() => {
    if (isRestTimerActive && restTimeRemaining === 0 && !hasNotifiedRef.current) {
      hasNotifiedRef.current = true;

      if (audioEnabled) {
        playTimerChime();
      }
      if (vibrationEnabled) {
        vibrateTimer();
      }
      if (document.visibilityState === 'hidden') {
        sendTimerNotification();
      }
    }
  }, [isRestTimerActive, restTimeRemaining, audioEnabled, vibrationEnabled]);

  // Cleanup on unmount
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

  const isOvertime = restTimeRemaining <= 0;
  const displayTime = Math.abs(restTimeRemaining);
  const minutes = Math.floor(displayTime / 60);
  const seconds = displayTime % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  const elapsed = restTimerDuration - restTimeRemaining;
  const progressPercent =
    restTimerDuration > 0
      ? Math.min(100, Math.max(0, (elapsed / restTimerDuration) * 100))
      : 100;

  // Show cutting bonus indicator when +30s was added
  const hasCuttingBonus =
    trainingPhase?.mode === "cutting" &&
    tier !== undefined &&
    CUTTING_BONUS_TIERS.has(tier);

  return (
    <div
      className={`mx-4 rounded-lg border p-4 space-y-3 ${
        isOvertime
          ? "border-amber-500/50 bg-amber-500/10"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {isOvertime ? "REST COMPLETE" : "REST"}
          {hasCuttingBonus && (
            <span className="ml-2 text-xs text-blue-400">+30s cut</span>
          )}
        </span>
        <span
          className={`text-xl font-mono font-bold ${
            isOvertime ? "text-amber-400" : "text-foreground"
          }`}
        >
          {isOvertime ? "+" : ""}
          {timeStr}{" "}
          <span className="text-sm text-muted-foreground font-normal">
            / {Math.floor(restTimerDuration / 60)}:
            {(restTimerDuration % 60).toString().padStart(2, "0")}
          </span>
        </span>
      </div>

      <Progress value={progressPercent} className="h-2" />

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => handleAddTime(30)}>
          +30s
        </Button>
        <Button variant="secondary" size="sm" onClick={handleSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}
