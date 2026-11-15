"use client";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { Moon, Minus, Sun, Circle } from "lucide-react";
import { formatSleep } from "@/lib/health/sleep";
import type { SleepHours, StressLevel } from "@/types";

interface ReadinessCheckProps {
  sleepHours: SleepHours | null;
  stressLevel: StressLevel | null;
  onSleepChange: (value: SleepHours) => void;
  onStressChange: (value: StressLevel) => void;
  /** Minutes asleep last night from Apple Health, when known. */
  healthSleepMinutes?: number | null;
  onNext?: () => void;
  onSkip?: () => void;
}

/**
 * Pre-workout sleep and stress check. Suggests skipping accessories when
 * sleep was under 5 hours and energy is low. When Apple Health has last night's
 * sleep, the matching answer is already selected and can be changed.
 *
 * @evidence readiness
 */
export function ReadinessCheck({
  sleepHours,
  stressLevel,
  onSleepChange,
  onStressChange,
  healthSleepMinutes,
  onNext,
  onSkip,
}: ReadinessCheckProps) {
  const showSuggestion = sleepHours === "<5" && stressLevel === "low";

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        Sleep and energy are saved with the workout.
        <EvidenceLine ruleId="readiness" variant="icon" />
      </p>

      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">
          Sleep last night
        </label>
        <div className="flex gap-2">
          <Button
            variant={sleepHours === "<5" ? "default" : "outline"}
            className="flex-1"
            onClick={() => onSleepChange("<5")}
          >
            <Moon className="h-4 w-4" /> &lt;5h
          </Button>
          <Button
            variant={sleepHours === "5-7" ? "default" : "outline"}
            className="flex-1"
            onClick={() => onSleepChange("5-7")}
          >
            <Minus className="h-4 w-4" /> 5-7h
          </Button>
          <Button
            variant={sleepHours === "7+" ? "default" : "outline"}
            className="flex-1"
            onClick={() => onSleepChange("7+")}
          >
            <Sun className="h-4 w-4" /> 7+h
          </Button>
        </div>
        {healthSleepMinutes != null && (
          <p className="text-xs text-muted-foreground">
            {formatSleep(healthSleepMinutes)} last night, from Apple Health. Tap to change.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">
          Stress / energy
        </label>
        <div className="flex gap-2">
          <Button
            variant={stressLevel === "low" ? "default" : "outline"}
            className="flex-1"
            onClick={() => onStressChange("low")}
          >
            <Circle className="h-3 w-3 fill-destructive text-destructive" /> Low
          </Button>
          <Button
            variant={stressLevel === "normal" ? "default" : "outline"}
            className="flex-1"
            onClick={() => onStressChange("normal")}
          >
            <Circle className="h-3 w-3 fill-warning text-warning" /> Normal
          </Button>
          <Button
            variant={stressLevel === "good" ? "default" : "outline"}
            className="flex-1"
            onClick={() => onStressChange("good")}
          >
            <Circle className="h-3 w-3 fill-success text-success" /> Good
          </Button>
        </div>
      </div>

      {showSuggestion && (
        <Alert>
          <AlertDescription>
            Low sleep + low energy detected. Consider skipping accessories today.
          </AlertDescription>
        </Alert>
      )}

      {(onNext || onSkip) && (
        <div className="flex flex-col gap-2">
          {onNext && (
            <Button onClick={onNext} disabled={!sleepHours || !stressLevel}>
              NEXT {"\u2192"} Body Check
            </Button>
          )}
          {onSkip && (
            <Button variant="ghost" onClick={onSkip}>
              Skip
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
