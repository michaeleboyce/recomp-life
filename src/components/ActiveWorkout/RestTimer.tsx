"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { EvidenceSheet } from "@/components/Evidence/EvidenceSheet";
import { GradeChip } from "@/components/ui/grade-chip";
import { formatTraceEffect } from "@/components/ui/trace-list";
import { useWorkoutStore } from "@/stores/workoutStore";
import { TimerWorkerManager } from "@/lib/timerWorker";
import { playTimerChime, vibrateTimer, sendTimerNotification } from "@/lib/audio";
import { getRule, isRuleId, type RuleId } from "@/lib/evidence";
import {
  hasCuttingRestBonus,
  formatRestDuration,
  getRestEvidenceId,
} from "@/lib/restTimes";
import { cn } from "@/lib/utils";
import type { DecisionTrace, TrainingPhase } from "@/types";

/** Small top-ups to the remaining rest. */
const EXTEND_SECONDS = [5, 15] as const;
const RING_R = 76;
const RING_C = 2 * Math.PI * RING_R;

interface RestTimerProps {
  audioEnabled?: boolean;
  vibrationEnabled?: boolean;
  /** User's current training phase: shows the cutting rest bonus when it applied. */
  trainingPhase?: TrainingPhase;
  /** What comes after the rest, e.g. "Next: set 3 of 5 · 190 lbs". */
  nextLabel?: string;
  /**
   * How this rest's length was reached, as saved when the workout started: each step
   * with its grade, and the research behind it. Without it the rule icons are shown.
   */
  why?: DecisionTrace | null;
  /** Above the timer: how the set just logged compared with its forecast. */
  banner?: ReactNode;
  /** In place of `nextLabel`: a card for what comes next. */
  upNext?: ReactNode;
}

/** A trace step's grade chip that opens the rule behind it. */
function RuleChip({ ruleId }: { ruleId: RuleId }) {
  const [open, setOpen] = useState(false);
  const rule = getRule(ruleId);
  return (
    <>
      <button
        type="button"
        data-evidence={ruleId}
        aria-label={`${rule.title}: ${rule.strength} evidence`}
        onClick={() => setOpen(true)}
        className="w-fit rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <GradeChip strength={rule.strength} />
      </button>
      <EvidenceSheet ruleId={ruleId} open={open} onOpenChange={setOpen} hideLibraryLink />
    </>
  );
}

/** "Why 3:30": the saved rest trace, one row per step, and the research behind the first rule. */
function RestWhy({ trace }: { trace: DecisionTrace }) {
  const [open, setOpen] = useState(false);
  const firstRule = trace.steps.map((s) => s.ruleId).find((id): id is RuleId => !!id && isRuleId(id));
  const total = typeof trace.result === "number" ? formatRestDuration(trace.result) : String(trace.result);
  return (
    <div data-testid="rest-why" className="flex min-w-0 flex-col">
      <span className="font-display text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        Why {total}
      </span>
      <ul>
        {trace.steps.map((step) => (
          <li
            key={step.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border py-1.5 text-[13px]"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span>{step.title}</span>
              {step.ruleId && isRuleId(step.ruleId) && <RuleChip ruleId={step.ruleId} />}
            </span>
            <b
              className={cn(
                "font-mono tabular-nums",
                step.effect.op === "add" && (step.effect.value ?? 0) > 0 && "text-tier-t1"
              )}
            >
              {formatTraceEffect(step)}
            </b>
          </li>
        ))}
      </ul>
      {firstRule && (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-8 w-fit items-center text-xs font-semibold text-accent-primary underline decoration-dotted underline-offset-4"
          >
            Read the research
          </button>
          <EvidenceSheet ruleId={firstRule} open={open} onOpenChange={setOpen} hideLibraryLink />
        </>
      )}
    </div>
  );
}

/**
 * The rest between sets: a screen of its own while it runs. Counts down, can be
 * extended or skipped, says why it is this long, and hands the screen back to the
 * set when it ends (with the chime, vibration and notification the settings allow).
 */
export function RestTimer({
  audioEnabled = false,
  vibrationEnabled = false,
  trainingPhase,
  nextLabel,
  why,
  banner,
  upNext,
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

  // Rest is over: let the user know, then give the screen back to the set.
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

  const left = restTimerDuration > 0 ? Math.min(1, Math.max(0, restTimeRemaining / restTimerDuration)) : 0;

  // Why the rest is this long (heavy vs lighter sets); none for warm-ups.
  const restEvidenceId = tier ? getRestEvidenceId(tier) : null;
  const hasCuttingBonus = !!tier && hasCuttingRestBonus(tier, trainingPhase);

  return (
    <div role="timer" aria-label="Rest timer" className="flex min-h-full flex-col gap-4">
      {banner}

      <div className="grid grid-cols-[minmax(0,172px)_minmax(0,1fr)] items-center gap-3.5">
        <div className="relative aspect-square w-full">
          <svg aria-hidden="true" viewBox="0 0 172 172" className="size-full -rotate-90">
            <circle cx="86" cy="86" r={RING_R} fill="none" stroke="var(--border)" strokeWidth="9" />
            <circle
              data-testid="rest-ring"
              cx="86"
              cy="86"
              r={RING_R}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - left)}
              className="transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span data-testid="rest-label" className="sr-only">
              Rest
            </span>
            <span
              data-testid="rest-remaining"
              className="font-display text-[52px] leading-none font-extrabold tabular-nums"
            >
              {formatRestDuration(restTimeRemaining)}
            </span>
            <span className="text-xs text-muted-foreground">
              of <span className="font-mono tabular-nums">{formatRestDuration(restTimerDuration)}</span>
            </span>
          </div>
        </div>

        {why ? (
          <RestWhy trace={why} />
        ) : (
          <span className="flex flex-wrap items-center gap-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Rest
            {restEvidenceId && <EvidenceLine ruleId={restEvidenceId} variant="icon" hideLibraryLink />}
            {hasCuttingBonus && (
              <span className="inline-flex items-center gap-1 tracking-normal text-info normal-case">
                +30s cut
                <EvidenceLine ruleId="rest-cut-bonus" variant="icon" hideLibraryLink />
              </span>
            )}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        {EXTEND_SECONDS.map((seconds) => (
          <button
            key={seconds}
            type="button"
            className="h-12 flex-1 rounded-full border-[1.5px] border-border font-mono text-sm transition-colors active:bg-card"
            onClick={() => handleAddTime(seconds)}
          >
            +{seconds}s
          </button>
        ))}
      </div>

      {upNext ??
        (nextLabel && (
          <p className="font-mono text-[13px] tabular-nums text-muted-foreground">{nextLabel}</p>
        ))}

      <button
        type="button"
        onClick={handleSkip}
        className="mt-auto h-[60px] w-full shrink-0 rounded-full bg-primary font-display text-[19px] leading-none font-extrabold tracking-[0.14em] text-primary-foreground uppercase transition-transform active:scale-[0.99]"
      >
        Skip rest
      </button>
    </div>
  );
}
