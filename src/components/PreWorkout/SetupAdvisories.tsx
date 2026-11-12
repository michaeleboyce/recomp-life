"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EXERCISES } from "@/lib/exercises";
import type { ActivityNote } from "@/lib/activities";
import type { RunAdvisory } from "@/lib/runRecovery";
import type { ExerciseDecaySuggestion } from "@/lib/weightDecay";
import type { RecoveryWarning } from "./useWorkoutSetup";

interface SetupAdvisoriesProps {
  runAdvisory: RunAdvisory | null;
  onDismissRunAdvisory: () => void;
  onSkipToday: () => void;
  activityNote: ActivityNote | null;
  onDismissActivityNote: () => void;
  recoveryWarnings: RecoveryWarning[];
  recoveryChoice: "proceed" | "reduce" | null;
  onRecoveryChoice: (choice: "proceed" | "reduce") => void;
  decaySuggestions: ExerciseDecaySuggestion[];
  onAcceptDecay: (exerciseId: string, tier: "T1" | "T2", weight: number) => void;
  onDismissDecay: (exerciseId: string, tier: string) => void;
  /** Evidence lines, supplied by the page that owns these surfaces. */
  runEvidence?: ReactNode;
  activityEvidence?: ReactNode;
  recoveryEvidence?: ReactNode;
  decayEvidence?: (suggestion: ExerciseDecaySuggestion) => ReactNode;
}

/**
 * The things worth a look before starting: a recent run or hard session, lifts
 * trained too recently, and weights to bring down after time off. Each says why,
 * and each leaves the decision to the user.
 */
export function SetupAdvisories(props: SetupAdvisoriesProps) {
  const { runAdvisory, activityNote, recoveryWarnings, decaySuggestions } = props;
  const dismissRun = (label: string) => (
    <Button size="sm" variant="outline" onClick={props.onDismissRunAdvisory}>
      {label}
    </Button>
  );

  return (
    <>
      {runAdvisory?.level === "advisory" && (
        <Callout
          variant="warning"
          title="Run Fatigue Advisory"
          actions={
            <>
              {dismissRun("Proceed")}
              {dismissRun("Add warm-ups")}
              {dismissRun("Reduce 10%")}
            </>
          }
        >
          <p>{runAdvisory.message}</p>
          {props.runEvidence}
        </Callout>
      )}

      {runAdvisory?.level === "strong" && (
        <Callout
          variant="danger"
          title="Legs may still be fatigued"
          actions={
            <>
              {dismissRun("Proceed")}
              <Button size="sm" variant="outline" onClick={props.onSkipToday}>
                Skip today
              </Button>
            </>
          }
        >
          <p>{runAdvisory.message}</p>
          {props.runEvidence}
        </Callout>
      )}

      {activityNote && (
        <Callout
          variant="info"
          actions={
            <Button size="sm" variant="outline" onClick={props.onDismissActivityNote}>
              Got it
            </Button>
          }
        >
          <p>{activityNote.message}</p>
          {props.activityEvidence}
        </Callout>
      )}

      {recoveryWarnings.length > 0 && (
        <Callout variant="warning" title="Trained recently">
          {recoveryWarnings.map((w) => (
            <p key={w.exerciseName}>
              You trained {w.exerciseName}{" "}
              <span className="font-mono tabular-nums">{w.hoursAgo}h</span> ago.
            </p>
          ))}
          {props.recoveryEvidence}
          <div className="space-y-1 pt-1">
            {(
              [
                ["proceed", "Proceed as planned"],
                ["reduce", "Reduce T1 weight by 10%"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex min-h-9 cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="recoveryChoice"
                  checked={props.recoveryChoice === value}
                  onChange={() => props.onRecoveryChoice(value)}
                  className="accent-foreground"
                />
                {label}
              </label>
            ))}
          </div>
        </Callout>
      )}

      {decaySuggestions.map((suggestion) => {
        const name = EXERCISES[suggestion.exerciseId]?.name ?? suggestion.exerciseId;
        const weeks = Math.floor(suggestion.daysSinceLastWorkout / 7);
        return (
          <Callout
            key={`decay-${suggestion.exerciseId}-${suggestion.tier}`}
            variant="warning"
            title={`${name} (${suggestion.tier})`}
            actions={
              <>
                <Button
                  size="sm"
                  onClick={() =>
                    props.onAcceptDecay(
                      suggestion.exerciseId,
                      suggestion.tier,
                      suggestion.suggestedWeight
                    )
                  }
                >
                  Accept ({suggestion.suggestedWeight} lbs)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => props.onDismissDecay(suggestion.exerciseId, suggestion.tier)}
                >
                  Keep {suggestion.currentWeight} lbs
                </Button>
              </>
            }
          >
            <p>
              {weeks} week{weeks !== 1 ? "s" : ""} since last session. Suggest reducing from{" "}
              <span className="font-mono tabular-nums">{suggestion.currentWeight}</span> to{" "}
              <span className="font-mono tabular-nums">{suggestion.suggestedWeight} lbs</span>.
            </p>
            {props.decayEvidence?.(suggestion)}
          </Callout>
        );
      })}
    </>
  );
}
