"use client";

import type { ReactNode } from "react";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { useLiftStates, useSettings } from "@/hooks";
import { T3_INCREMENT_LBS, T3_LAST_SET_INCREASE_REPS } from "@/lib/progression";
import type { Tier, WorkoutLocation } from "@/types";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { AdjustLiftSheet, BackToPlanButton } from "@/components/LogEdit";
import { minWeightFor, plannedSetsOf, weightStepFor } from "@/components/ActiveWorkout/setPlan";
import { weightUnit } from "@/components/SetPlan/setPlanModel";
import { schemeText } from "@/components/Lift/homeVersion";
import { formatShortDate } from "@/components/chart-kit";
import { nameInSentence } from "@/components/Today/todayModel";
import { LIFT_NAMES } from "@/components/Progress/lifts";
import type { LiftSession } from "@/components/Lift/sessions";
import { liftPlanWeight, type ExerciseKind, type NextPlanned } from "./exercisePageModel";
import type { NextSetPlanStore } from "./nextSetPlanAdapter";
import {
  AdjustRow,
  NextSessionCard,
  NextSessionSection,
  NextSetPlanEditor,
  PlanYouRow,
  weightTier,
} from "./NextSessionParts";

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

/** Not in the coming workouts: says so, with the weight last lifted. */
function NotPlanned({ kind, sessions }: { kind: ExerciseKind; sessions: readonly LiftSession[] }) {
  const last = sessions[0];
  return (
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
  /** Undefined while loading; null when the coming workouts do not have it. */
  next: NextPlanned | null | undefined;
  location: WorkoutLocation;
  /** Its sessions, newest first; undefined while loading. */
  sessions: readonly LiftSession[] | undefined;
  /** The new-best line for a barbell lift's T1. */
  prLine?: ReactNode;
  store: NextSetPlanStore;
}) {
  const settings = useSettings();
  const liftStates = useLiftStates();
  const equipment = (settings ?? DEFAULT_USER_PROFILE.settings).equipment;

  if (next === undefined || liftStates === undefined || settings === undefined) {
    return <NextSessionSection loading />;
  }

  if (!next) {
    return (
      <NextSessionSection loading={sessions === undefined}>
        {sessions && <NotPlanned kind={kind} sessions={sessions} />}
      </NextSessionSection>
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
  const unit = weightUnit(entry.perHand ?? false);
  const liftShort = kind.kind === "lift" ? LIFT_NAMES[kind.liftId].short : nameInSentence(exerciseId);
  const when =
    next.workoutsAway === 0
      ? "Your next workout"
      : `Workout ${next.templateId}, ${next.workoutsAway} ${next.workoutsAway === 1 ? "workout" : "workouts"} from now`;
  const canAdjust = !!(asOther ? ownState : state);

  return (
    <NextSessionSection title={location === "home" ? "Next session at home" : "Next session"}>
      <NextSessionCard
        weight={entry.weight}
        unit={unit}
        tier={tier}
        scheme={schemeText({ sets: entry.targetSets, reps: entry.targetReps, isAMRAP: entry.isAMRAP })}
        isAMRAP={entry.isAMRAP}
      >
        <p data-testid="next-when" className="text-xs text-muted-foreground">
          {when}
          {next.projected ? ", if the workouts before it go as planned." : "."}
        </p>
        {planWeight != null && (
          <PlanYouRow
            planWeight={planWeight}
            weight={entry.weight}
            backToPlan={
              <BackToPlanButton exerciseId={liftId} tier={weightTier(tier)} planWeight={planWeight} unit={unit} />
            }
          >
            Set by you. The plan&apos;s own weight stays beside yours until you lift it.
          </PlanYouRow>
        )}
        {kind.kind !== "accessory" && kind.kind !== "reference" && <ProgressionLine tier={tier} liftShort={liftShort} />}
        <NextSetPlanEditor
          exerciseId={exerciseId}
          liftId={liftId}
          tier={tier}
          name={name}
          planSets={plannedSetsOf(entry)}
          unit={unit}
          step={weightStepFor(exerciseId, location, equipment)}
          minWeight={minWeightFor(exerciseId, location, equipment)}
          {...(location === "home" ? { maxWeight: equipment.maxDumbbellWeight } : {})}
          store={store}
        />
      </NextSessionCard>
      {prLine}
      {canAdjust && (
        <AdjustRow sheet={<AdjustLiftSheet exerciseId={asOther ? exerciseId : liftId} tier={tier} />}>
          Wrong weight for next time? Set it yourself, from now on.
        </AdjustRow>
      )}
    </NextSessionSection>
  );
}
