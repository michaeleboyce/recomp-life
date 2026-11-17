"use client";

import { useMemo, type ReactNode } from "react";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { useLiftStates, useSettings } from "@/hooks";
import { T3_INCREMENT_LBS, T3_LAST_SET_INCREASE_REPS } from "@/lib/progression";
import { tierStyle } from "@/lib/tierStyle";
import { cn } from "@/lib/utils";
import { nextSetPlanKey } from "@/lib/workout/nextSetPlans";
import type { TermId } from "@/lib/glossary";
import type { PlannedSet, Tier, WorkoutLocation } from "@/types";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { SectionHeader } from "@/components/ui/section-header";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Term } from "@/components/ui/term";
import { AdjustLiftSheet, BackToPlanButton } from "@/components/LogEdit";
import { minWeightFor, weightStepFor } from "@/components/ActiveWorkout/setPlan";
import { SetPlanEditor } from "@/components/SetPlan/SetPlanEditor";
import { homeNextSession, homePlanWeight } from "@/components/Lift/homeVersion";
import { HomeNextWeight } from "@/components/Lift/PrLine";
import { useHomePlanContext } from "@/components/Lift/useHomePlanContext";
import { formatShortDate } from "@/components/chart-kit";
import { nameInSentence } from "@/components/Today/todayModel";
import { LIFT_NAMES, type MainLiftId } from "@/components/Progress/lifts";
import type { LiftSession } from "@/components/Lift/sessions";
import {
  editorSets,
  liftPlanWeight,
  planSetsOf,
  sameSets,
  type ExerciseKind,
  type NextPlanned,
} from "./exercisePageModel";
import type { NextSetPlanStore } from "./nextSetPlanAdapter";

const TIER_TERM: Partial<Record<Tier, TermId>> = { T1: "t1", T2: "t2", T3: "t3" };
type WeightTier = "T1" | "T2" | "T3";
const weightTier = (tier: Tier): WeightTier => (tier === "T2" ? "T2" : tier === "T3" ? "T3" : "T1");

/**
 * The next session's sets as chips (E5), bound to its next-session set plan (E6): a
 * change is kept for that session only, "Back to plan" (or setting every set back)
 * removes it.
 */
function NextSetPlanEditor({
  exerciseId,
  liftId,
  tier,
  name,
  planSets,
  unit,
  step,
  minWeight,
  maxWeight,
  store,
}: {
  exerciseId: string;
  liftId: string;
  tier: Tier;
  name: string;
  planSets: PlannedSet[];
  unit: string;
  step: number;
  minWeight: number;
  maxWeight?: number;
  store: NextSetPlanStore;
}) {
  const key = nextSetPlanKey(exerciseId, tier);
  const stored = store.plans?.[key];
  const sets = editorSets(stored, planSets);
  if (planSets.length === 0) return null;
  return (
    <div data-testid="next-set-plan" className="flex flex-col gap-1.5 border-t border-border pt-2">
      <p className="text-xs text-muted-foreground">Each set, next session only. Tap one to change it.</p>
      <SetPlanEditor
        name={name}
        sets={sets}
        planSets={planSets}
        unit={unit}
        step={step}
        minWeight={minWeight}
        {...(maxWeight !== undefined ? { maxWeight } : {})}
        onChange={(next) => {
          if (!next || sameSets(next, planSets)) {
            void store.save(null, key);
            return;
          }
          void store.save(
            { exerciseId, liftId, tier, sets: next, planSets, createdAt: new Date().toISOString() },
            key
          );
        }}
      />
    </div>
  );
}

/** "Plan 190 · You 200", what it means, and the way back to the plan. */
function PlanYou({
  planWeight,
  weight,
  children,
  evidence,
  backToPlan,
}: {
  planWeight: number;
  weight: number;
  children: ReactNode;
  evidence?: ReactNode;
  backToPlan: ReactNode;
}) {
  return (
    <div data-testid="plan-you" className="flex items-center gap-3 border-t border-border pt-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex items-baseline gap-3 font-mono text-sm">
          <span>
            <span className="text-xs text-muted-foreground">Plan </span>
            <b data-testid="plan-weight">{planWeight}</b>
          </span>
          <span>
            <span className="text-xs text-muted-foreground">You </span>
            <b data-testid="your-weight">{weight}</b>
          </span>
        </p>
        <p className="text-[13px] text-muted-foreground">{children}</p>
      </div>
      {evidence}
      {backToPlan}
    </div>
  );
}

/** How a program lift's or T3's planned weight moves, with its rule. */
function ProgressionLine({ tier, liftShort }: { tier: Tier; liftShort: string }) {
  if (tier === "T3") {
    return (
      <div className="flex items-start gap-2 border-t border-border pt-2">
        <p data-testid="weight-line" className="flex-1 text-[13px] text-muted-foreground">
          The weight goes up {T3_INCREMENT_LBS} lb once the last set reaches {T3_LAST_SET_INCREASE_REPS} reps.
        </p>
        <EvidenceLine ruleId="t3-progression" variant="icon" />
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 border-t border-border pt-2">
      <p data-testid="weight-line" className="flex-1 text-[13px] text-muted-foreground">
        Complete every set and the {liftShort} goes up next time; miss and the scheme changes.
      </p>
      <EvidenceLine ruleId="gzclp-progression" variant="icon" />
    </div>
  );
}

/**
 * The next session of a barbell lift, a T3 or anything else the rotation plans, from
 * the coming workouts (`useUpcomingWorkouts`): its weight, tier and scheme, how the plan
 * moves it, "Plan · You" while it is set by hand (E7), Adjust weight and its sets.
 * Not in the coming workouts: says so, with the weight last lifted.
 */
export function PlannedNextSession({
  exerciseId,
  name,
  kind,
  next,
  location,
  sessions,
  prLine,
  store,
}: {
  exerciseId: string;
  name: string;
  kind: ExerciseKind;
  next: NextPlanned | null | undefined;
  location: WorkoutLocation;
  sessions: readonly LiftSession[];
  /** The new-best line for a barbell lift's T1. */
  prLine?: ReactNode;
  store: NextSetPlanStore;
}) {
  const settings = useSettings();
  const liftStates = useLiftStates();
  const equipment = (settings ?? DEFAULT_USER_PROFILE.settings).equipment;

  if (next === undefined || liftStates === undefined || settings === undefined) {
    return (
      <section aria-label="Next session" className="flex flex-col gap-2">
        <SectionHeader title="Next session" />
        <SkeletonCard />
      </section>
    );
  }

  if (!next) {
    const last = sessions[0];
    return (
      <section aria-label="Next session" className="flex flex-col gap-2">
        <SectionHeader title="Next session" />
        <div data-testid="not-planned" className="flex flex-col gap-1 rounded-xl bg-card px-4 py-3">
          <p className="text-sm text-foreground">
            {kind.kind === "accessory"
              ? "Not in your coming workouts. Add it as an accessory when you start one."
              : "Not in your coming workouts."}
          </p>
          {last ? (
            <p data-testid="last-weight" className="text-[13px] text-muted-foreground">
              Last time, {formatShortDate(last.t)}: <b className="font-mono text-foreground">{last.weight}</b> lbs ×{" "}
              {last.sets.map((s) => s.reps).join(", ")}
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">You have not done it yet.</p>
          )}
        </div>
      </section>
    );
  }

  const { entry } = next;
  const liftId = entry.exerciseId;
  const tier = entry.tier;
  const state = liftStates.find((s) => s.exerciseId === liftId);
  // A row done standing in for another lift at T3 has no form of its own; its own lift state is edited.
  const asOther = liftId !== exerciseId;
  const ownState = liftStates.find((s) => s.exerciseId === exerciseId);
  const planWeight = asOther ? null : liftPlanWeight(state, tier, entry.weight);
  const perHand = entry.perHand ?? false;
  const unit = perHand ? "lbs a hand" : "lbs";
  const style = tierStyle(tier);
  const term = TIER_TERM[tier];
  const scheme = `${entry.targetSets}×${entry.targetReps}${entry.isAMRAP ? "+" : ""}`;
  const liftShort = kind.kind === "lift" ? LIFT_NAMES[kind.liftId].short : nameInSentence(exerciseId);
  const when =
    next.workoutsAway === 0
      ? "Your next workout"
      : `Workout ${next.templateId}, ${next.workoutsAway} ${next.workoutsAway === 1 ? "workout" : "workouts"} from now`;
  const canAdjust = !!(asOther ? ownState : state);
  const planSets = planSetsOf(entry);

  return (
    <section aria-label="Next session" className="flex flex-col gap-2">
      <SectionHeader title={location === "home" ? "Next session at home" : "Next session"} />
      <div data-testid="next-session" className="flex flex-col gap-2 rounded-xl bg-accent-primary-soft px-4 py-3">
        <div className="flex items-end justify-between gap-3">
          {entry.weight > 0 ? (
            <p className="flex items-baseline gap-1.5">
              <b
                data-testid="next-weight"
                className="font-display text-[40px] leading-none font-extrabold text-foreground tabular-nums"
              >
                {entry.weight}
              </b>
              <span className="text-sm text-muted-foreground">{unit}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No weight set yet.</p>
          )}
          <p className="flex items-baseline gap-1.5 pb-1 font-mono text-sm font-medium">
            <span className={cn("text-xs font-bold", style.text)}>
              {term ? <Term id={term}>{style.label}</Term> : style.label}
            </span>
            {entry.isAMRAP ? <Term id="amrap-plus">{scheme}</Term> : <span>{scheme}</span>}
          </p>
        </div>
        <p data-testid="next-when" className="text-xs text-muted-foreground">
          {when}
          {next.projected ? ", if the workouts before it go as planned." : "."}
        </p>
        {planWeight != null && (
          <PlanYou
            planWeight={planWeight}
            weight={entry.weight}
            backToPlan={
              <BackToPlanButton exerciseId={liftId} tier={weightTier(tier)} planWeight={planWeight} unit={unit} />
            }
          >
            Set by you. The plan&apos;s own weight stays beside yours until you lift it.
          </PlanYou>
        )}
        {kind.kind !== "accessory" && kind.kind !== "reference" && <ProgressionLine tier={tier} liftShort={liftShort} />}
        <NextSetPlanEditor
          exerciseId={exerciseId}
          liftId={liftId}
          tier={tier}
          name={name}
          planSets={planSets}
          unit={unit}
          step={weightStepFor(exerciseId, location, equipment)}
          minWeight={minWeightFor(exerciseId, location, equipment)}
          {...(location === "home" ? { maxWeight: equipment.maxDumbbellWeight } : {})}
          store={store}
        />
      </div>
      {prLine}
      {canAdjust && (
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-xs text-muted-foreground">Wrong weight for next time? Set it yourself, from now on.</p>
          <AdjustLiftSheet exerciseId={asOther ? exerciseId : liftId} tier={tier} />
        </div>
      )}
    </section>
  );
}

/**
 * A home version's next session, as Today plans it (`homeNextSession`): its own weight
 * as lifted, how the plan reached it, "Plan · You" while set by hand, Adjust weight for
 * this exercise only, and its sets.
 */
export function HomeNextSession({
  liftId,
  exerciseId,
  name,
  store,
}: {
  liftId: MainLiftId;
  exerciseId: string;
  name: string;
  store: NextSetPlanStore;
}) {
  const plan = useHomePlanContext();
  const { short } = LIFT_NAMES[liftId];
  const next = useMemo(() => (plan ? homeNextSession(liftId, exerciseId, plan) : undefined), [plan, liftId, exerciseId]);
  const planWeight = useMemo(
    () => (plan && next ? homePlanWeight(liftId, exerciseId, plan, next) : null),
    [plan, next, liftId, exerciseId]
  );

  if (!plan || !next) {
    return (
      <section aria-label="Next session" className="flex flex-col gap-2">
        <SectionHeader title="Next session at home" />
        <SkeletonCard />
      </section>
    );
  }

  const unit = next.perHand ? "lbs a hand" : "lbs";
  const planSets = Array.from({ length: next.sets }, () => ({ weight: next.weight, reps: next.reps }));
  return (
    <section aria-label="Next session" className="flex flex-col gap-2">
      <SectionHeader title="Next session at home" />
      {/* The sheet edits this exercise's own weight; the barbell lift is left alone. */}
      <HomeNextWeight
        exerciseId={liftId}
        substituteId={exerciseId}
        liftShort={short}
        next={next}
        equipment={plan.equipment}
        planWeight={planWeight}
        backToPlan={
          planWeight != null && (
            <BackToPlanButton
              exerciseId={liftId}
              substituteId={exerciseId}
              tier={weightTier(next.tier)}
              planWeight={planWeight}
              unit={unit}
            />
          )
        }
        sets={
          <NextSetPlanEditor
            exerciseId={exerciseId}
            liftId={liftId}
            tier={next.tier}
            name={name}
            planSets={planSets}
            unit={unit}
            step={weightStepFor(exerciseId, "home", plan.equipment)}
            minWeight={minWeightFor(exerciseId, "home", plan.equipment)}
            maxWeight={plan.equipment.maxDumbbellWeight}
            store={store}
          />
        }
      />
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs text-muted-foreground">
          Wrong weight for next time? Set the {nameInSentence(exerciseId)} weight; the barbell {short} stays as it
          is, and the app keeps its own number beside yours.
        </p>
        <AdjustLiftSheet exerciseId={liftId} home={{ substituteId: exerciseId, tier: next.tier }} />
      </div>
    </section>
  );
}
