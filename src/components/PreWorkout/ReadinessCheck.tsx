"use client";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { SleepHours, StressLevel } from "@/types";

interface ReadinessCheckProps {
  sleepHours: SleepHours | null;
  stressLevel: StressLevel | null;
  onSleepChange: (value: SleepHours) => void;
  onStressChange: (value: StressLevel) => void;
  onNext: () => void;
  onSkip: () => void;
}

export function ReadinessCheck({
  sleepHours,
  stressLevel,
  onSleepChange,
  onStressChange,
  onNext,
  onSkip,
}: ReadinessCheckProps) {
  const showSuggestion = sleepHours === "<5" && stressLevel === "low";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">How are you feeling?</h2>
      </div>

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
            {"\uD83D\uDE34"} &lt;5h
          </Button>
          <Button
            variant={sleepHours === "5-7" ? "default" : "outline"}
            className="flex-1"
            onClick={() => onSleepChange("5-7")}
          >
            {"\uD83D\uDE10"} 5-7h
          </Button>
          <Button
            variant={sleepHours === "7+" ? "default" : "outline"}
            className="flex-1"
            onClick={() => onSleepChange("7+")}
          >
            {"\uD83D\uDE0A"} 7+h
          </Button>
        </div>
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
            {"\uD83D\uDD34"} Low
          </Button>
          <Button
            variant={stressLevel === "normal" ? "default" : "outline"}
            className="flex-1"
            onClick={() => onStressChange("normal")}
          >
            {"\uD83D\uDFE1"} Normal
          </Button>
          <Button
            variant={stressLevel === "good" ? "default" : "outline"}
            className="flex-1"
            onClick={() => onStressChange("good")}
          >
            {"\uD83D\uDFE2"} Good
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

      <div className="flex flex-col gap-2">
        <Button onClick={onNext} disabled={!sleepHours || !stressLevel}>
          NEXT {"\u2192"} Body Check
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}
