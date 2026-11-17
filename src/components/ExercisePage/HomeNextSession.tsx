"use client";

import { useMemo } from "react";
import { House } from "lucide-react";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { AdjustLiftSheet, BackToPlanButton } from "@/components/LogEdit";
import { minWeightFor, plannedSetsOf, weightStepFor } from "@/components/ActiveWorkout/setPlan";
import { weightUnit } from "@/components/SetPlan/setPlanModel";
import {
  homeNextSession,
  homePlanWeight,
  homeWeightLine,
  schemeText,
  type HomeWeightLine,
} from "@/components/Lift/homeVersion";
import { useHomePlanContext } from "@/components/Lift/useHomePlanContext";
import { nameInSentence } from "@/components/Today/todayModel";
import { LIFT_NAMES, type MainLiftId } from "@/components/Progress/lifts";
import type { NextSetPlanStore } from "./nextSetPlanAdapter";
import {
  AdjustRow,
  NextSessionCard,
  NextSessionSection,
  NextSetPlanEditor,
  PlanYouRow,
  weightTier,
} from "./NextSessionParts";

/**
 * The rule behind the home weight line, each with its own literal id, so the evidence
 * registry knows this is where it is shown.
 */
function HomeLineEvidence({ ruleId }: { ruleId: HomeWeightLine["ruleId"] }) {
  switch (ruleId) {
    case "home-progression":
      return <EvidenceLine ruleId="home-progression" variant="icon" />;
    case "cap-progression":
      return <EvidenceLine ruleId="cap-progression" variant="icon" />;
    case "transfer-ratio":
      return <EvidenceLine ruleId="transfer-ratio" variant="icon" />;
    case "strength-pooling":
      return <EvidenceLine ruleId="strength-pooling" variant="icon" />;
    case "dumbbell-conversion":
      return <EvidenceLine ruleId="dumbbell-conversion" variant="icon" />;
  }
}

/**
 * A home version's next session, as Today plans it (`homeNextSession`): its own weight
 * as lifted (the number Today shows), tier and scheme, "Plan · You" while set by hand,
 * how the plan reached it (`homeWeightLine`: its own progression, its seed, or re-entry,
 * and the cap policy at the heaviest dumbbell), its sets, and Adjust weight for this
 * exercise only. No new-best claim: a substitute's sets never give an estimated max.
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

  if (!plan || !next) return <NextSessionSection title="Next session at home" loading />;

  const unit = weightUnit(next.perHand);
  const line = homeWeightLine(liftId, short, exerciseId, next, plan.equipment);
  return (
    <NextSessionSection title="Next session at home">
      <NextSessionCard
        weight={next.weight}
        unit={unit}
        tier={next.tier}
        scheme={schemeText(next)}
        isAMRAP={next.isAMRAP}
      >
        {planWeight != null && (
          <PlanYouRow
            planWeight={planWeight}
            weight={next.weight}
            evidence={<EvidenceLine ruleId="target-evidence" variant="icon" />}
            backToPlan={
              <BackToPlanButton
                exerciseId={liftId}
                substituteId={exerciseId}
                tier={weightTier(next.tier)}
                planWeight={planWeight}
                unit={unit}
              />
            }
          >
            Set by you. Until you lift it, it counts a little toward your {short} estimate, so your other {short}{" "}
            weights shift with it.
          </PlanYouRow>
        )}
        {next.plannedAs && (
          <p data-testid="home-planned-as" className="text-[13px] text-foreground">
            Your next home workout has {nameInSentence(next.plannedAs)} for {short}; this is the weight if you swap
            to {nameInSentence(exerciseId)}.
          </p>
        )}
        {line.text && (
          <div className="flex items-start gap-2 border-t border-border pt-2">
            <House className="mt-0.5 size-4 shrink-0 text-accent-primary" aria-hidden="true" />
            <p data-testid="home-weight-line" className="flex-1 text-[13px] text-muted-foreground">
              {line.text}
            </p>
            <HomeLineEvidence ruleId={line.ruleId} />
          </div>
        )}
        <NextSetPlanEditor
          exerciseId={exerciseId}
          liftId={liftId}
          tier={next.tier}
          name={name}
          planSets={plannedSetsOf({ targetSets: next.sets, targetReps: next.reps, weight: next.weight })}
          unit={unit}
          step={weightStepFor(exerciseId, "home", plan.equipment)}
          minWeight={minWeightFor(exerciseId, "home", plan.equipment)}
          maxWeight={plan.equipment.maxDumbbellWeight}
          store={store}
        />
      </NextSessionCard>
      {/* The sheet edits this exercise's own weight; the barbell lift is left alone. */}
      <AdjustRow sheet={<AdjustLiftSheet exerciseId={liftId} home={{ substituteId: exerciseId, tier: next.tier }} />}>
        Wrong weight for next time? Set the {nameInSentence(exerciseId)} weight; the barbell {short} stays as it is,
        and the app keeps its own number beside yours.
      </AdjustRow>
    </NextSessionSection>
  );
}
