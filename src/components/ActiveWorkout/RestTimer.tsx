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
import { REST_WARNING_SECONDS, planRestAlerts } from "@/lib/restAlerts";
import {
  hasCuttingRestBonus,
  formatRestDuration,
  getRestEvidenceId,
} from "@/lib/restTimes";
import { cn } from "@/lib/utils";
import { cancelRestAlerts, restEndHaptic, scheduleRestAlerts } from "@/native/restNotifications";
import type { DecisionTrace, TrainingPhase } from "@/types";

/** Small top-ups to the remaining rest. */
const EXTEND_SECONDS = [5, 15] as const;
const RING_R = 76;
const RING_C = 2 * Math.PI * RING_R;
/**
 * The last stretch of a rest, shown without sound: ring and numeral change colour.
 * The same moment the phone app's "get ready" alert is given in the background.
 */
export const FINAL_SECONDS = REST_WARNING_SECONDS;

/**
 * How much of the ring to draw. The clock ticks once a second, so the ring aims at
 * where the next tick will be and glides there over that second (a linear CSS
 * transition): it moves all the time and empties exactly as the clock reaches 0:00.
 * Before the first frame it shows where the rest is now, so it starts full.
 */
export function restRingFraction(remaining: number, duration: number, gliding: boolean): number {
  if (duration <= 0) return 0;
  const target = gliding ? remaining - 1 : remaining;
  return Math.min(1, Math.max(0, target / duration));
}

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
  /** Above "Skip rest": another way on from the set just logged (a drop set). */
  action?: ReactNode;
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
      <span className="font-display text-[12px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
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
            className="inline-flex min-h-11 w-fit items-center text-xs font-semibold text-accent-primary underline decoration-dotted underline-offset-4"
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
  action,
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

  // In the phone app: alerts for the end of this rest (and the warning before it),
  // scheduled with the system so they fire while the app is in the background.
  // Scheduled again when the rest is extended; removed when it ends or is skipped.
  useEffect(() => {
    if (!isRestTimerActive) return;
    void scheduleRestAlerts(
      planRestAlerts({
        now: new Date(),
        remainingSeconds: useWorkoutStore.getState().restTimeRemaining,
        nextLabel,
      })
    );
    return () => {
      void cancelRestAlerts();
    };
  }, [isRestTimerActive, restTimerDuration, nextLabel]);

  // Rest is over: let the user know, then give the screen back to the set.
  useEffect(() => {
    if (!isRestTimerActive || restTimeRemaining > 0) return;
    if (audioEnabled) playTimerChime();
    if (vibrationEnabled) {
      vibrateTimer();
      void restEndHaptic();
    }
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

  // After the first frame the ring glides toward the next tick (see restRingFraction).
  const [gliding, setGliding] = useState(false);
  useEffect(() => {
    if (!isRestTimerActive) return;
    const frame = requestAnimationFrame(() => setGliding(true));
    return () => {
      cancelAnimationFrame(frame);
      // The next rest starts full again.
      setGliding(false);
    };
  }, [isRestTimerActive]);

  if (!isRestTimerActive) return null;

  const left = restRingFraction(restTimeRemaining, restTimerDuration, gliding);
  const final = restTimeRemaining > 0 && restTimeRemaining <= FINAL_SECONDS;

  // Why the rest is this long (heavy vs lighter sets); none for warm-ups.
  const restEvidenceId = tier ? getRestEvidenceId(tier) : null;
  const hasCuttingBonus = !!tier && hasCuttingRestBonus(tier, trainingPhase);

  return (
    <div
      role="timer"
      aria-label="Rest timer"
      data-final={final || undefined}
      className="flex min-h-full flex-col gap-4"
    >
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
              stroke={final ? "var(--rest-final)" : "var(--primary)"}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - left)}
              // The sweep is linear (a clock); the colour change in the last ten seconds
              // eases out. Under reduced motion the ring steps once a second.
              className="[transition:stroke-dashoffset_1000ms_linear,stroke_300ms_ease-out] motion-reduce:transition-none"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span data-testid="rest-label" className="sr-only">
              Rest
            </span>
            <span
              // A fresh element each second in the last ten, so the pulse plays per tick.
              key={final ? restTimeRemaining : "rest"}
              data-testid="rest-remaining"
              className={cn(
                "font-display text-[52px] leading-none font-extrabold tabular-nums",
                final && "text-rest-final motion-safe:animate-tick-pulse"
              )}
            >
              {formatRestDuration(restTimeRemaining)}
            </span>
            {final ? (
              <span data-testid="rest-final-note" className="text-xs font-semibold text-rest-final">
                Get ready
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                of <span className="font-mono tabular-nums">{formatRestDuration(restTimerDuration)}</span>
              </span>
            )}
            {/* Said once by a screen reader as the last ten seconds begin. */}
            <span aria-live="polite" className="sr-only">
              {final ? `${FINAL_SECONDS} seconds left` : ""}
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

      <div className="mt-auto flex shrink-0 flex-col gap-2">
        {action}
        <button
          type="button"
          onClick={handleSkip}
          className="h-[60px] w-full shrink-0 rounded-full bg-primary font-display text-[19px] leading-none font-extrabold tracking-[0.14em] text-primary-foreground uppercase transition-transform active:scale-[0.99]"
        >
          Skip rest
        </button>
      </div>
    </div>
  );
}
