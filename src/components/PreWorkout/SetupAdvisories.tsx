"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Term } from "@/components/ui/term";
import { EXERCISES } from "@/lib/exercises";
import type { ActivityNote } from "@/lib/activities";
import type { RunAdvisory } from "@/lib/runRecovery";
import type { ExerciseDecaySuggestion } from "@/lib/weightDecay";
import type { RecoveryWarning, RunChoice } from "./useWorkoutSetup";

interface SetupAdvisoriesProps {
  runAdvisory: RunAdvisory | null;
  /** Acts on the run advisory and records the choice (see `chooseRunOption`). */
  onRunChoice: (choice: RunChoice) => void;
  onSkipToday: () => void;
  activityNote: ActivityNote | null;
  onDismissActivityNote: () => void;
  recoveryWarnings: RecoveryWarning[];
  recoveryChoice: "proceed" | "reduce" | null;
  onRecoveryChoice: (choice: "proceed" | "reduce") => void;
  /**
   * What "reduce" does to today's T1 (run and recovery advisories alike); null when it
   * would change nothing, and then it is not offered.
   */
  reduction: { name: string; from: number; to: number } | null;
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
  const { runAdvisory, activityNote, recoveryWarnings, decaySuggestions, reduction } = props;
  const runButton = (label: string, choice: RunChoice) => (
    <Button size="sm" className="h-11" variant="outline" onClick={() => props.onRunChoice(choice)}>
      {label}
    </Button>
  );
  const recoveryButton = (label: ReactNode, choice: "proceed" | "reduce") => (
    <Button size="sm" className="h-11" variant="outline" onClick={() => props.onRecoveryChoice(choice)}>
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
              {runButton("Proceed", "proceed")}
              {runButton("Add warm-ups", "extra_warmups")}
              {reduction && runButton(`Lower to ${reduction.to} lbs`, "reduce_10")}
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
              {runButton("Proceed", "proceed")}
              <Button
                size="sm"
                className="h-11"
                variant="outline"
                onClick={() => {
                  props.onRunChoice("skip");
                  props.onSkipToday();
                }}
              >
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
            <Button size="sm" className="h-11" variant="outline" onClick={props.onDismissActivityNote}>
              Got it
            </Button>
          }
        >
          <p>{activityNote.message}</p>
          {props.activityEvidence}
        </Callout>
      )}

      {/* Answered once, like the run advisory: reduce changes today's plan. */}
      {recoveryWarnings.length > 0 && props.recoveryChoice === null && (
        <Callout
          variant="warning"
          title="Trained recently"
          actions={
            <>
              {recoveryButton("Proceed as planned", "proceed")}
              {/* Named, not "T1": a glossary button cannot sit inside this button. */}
              {reduction && recoveryButton(`Lower ${reduction.name} to ${reduction.to} lbs`, "reduce")}
            </>
          }
        >
          {recoveryWarnings.map((w) => (
            <p key={w.exerciseName}>
              You trained {w.exerciseName}{" "}
              <span className="font-mono tabular-nums">{w.hoursAgo}h</span> ago.
            </p>
          ))}
          {props.recoveryEvidence}
        </Callout>
      )}

      {decaySuggestions.map((suggestion) => {
        const name = EXERCISES[suggestion.exerciseId]?.name ?? suggestion.exerciseId;
        const weeks = Math.floor(suggestion.daysSinceLastWorkout / 7);
        return (
          <Callout
            key={`decay-${suggestion.exerciseId}-${suggestion.tier}`}
            variant="warning"
            title={
              <>
                {name} (<Term id={suggestion.tier === "T1" ? "t1" : "t2"}>{suggestion.tier}</Term>)
              </>
            }
            actions={
              <>
                <Button
                  size="sm"
                  className="h-11"
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
                  className="h-11"
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
