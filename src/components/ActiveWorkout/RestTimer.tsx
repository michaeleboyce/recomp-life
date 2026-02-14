"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useWorkoutStore } from "@/stores/workoutStore";

export function RestTimer() {
  const {
    isRestTimerActive,
    restTimeRemaining,
    restTimerDuration,
    tickTimer,
    skipRest,
    addRestTime,
  } = useWorkoutStore();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRestTimerActive) {
      intervalRef.current = setInterval(() => {
        tickTimer();
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRestTimerActive, tickTimer]);

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
        <Button variant="outline" size="sm" onClick={() => addRestTime(30)}>
          +30s
        </Button>
        <Button variant="secondary" size="sm" onClick={skipRest}>
          Skip
        </Button>
      </div>
    </div>
  );
}
