"use client";
// The pieces both next-session cards are built from (a planned lift's and a home
// version's), so the two read the same: the section, the weight with tier and scheme,
// "Plan · You" while the weight is set by hand, the sets and the Adjust weight row.
import type { ReactNode } from "react";
import { tierStyle } from "@/lib/tierStyle";
import { cn } from "@/lib/utils";
import { nextSetPlanKey } from "@/lib/workout/nextSetPlans";
import type { TermId } from "@/lib/glossary";
import type { NextSetPlan, PlannedSet, Tier } from "@/types";
import { toast } from "@/components/ui/toast";
import { SectionHeader } from "@/components/ui/section-header";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Term } from "@/components/ui/term";
import { PlanYou } from "@/components/SetPlan/PlanYou";
import { SetPlanEditor } from "@/components/SetPlan/SetPlanEditor";
import { differsFromPlan } from "@/components/SetPlan/setPlanModel";
import { editorSets } from "./exercisePageModel";
import type { NextSetPlanStore } from "./nextSetPlanAdapter";

const TIER_TERM: Partial<Record<Tier, TermId>> = { T1: "t1", T2: "t2", T3: "t3" };

/** The tier a weight is set at: warm-ups and anything else count as T1. */
export type WeightTier = "T1" | "T2" | "T3";
export const weightTier = (tier: Tier): WeightTier => (tier === "T2" ? "T2" : tier === "T3" ? "T3" : "T1");

/** The "Next session" section: its header, then `children`, or a skeleton while `loading`. */
export function NextSessionSection({
  title = "Next session",
  loading = false,
  children,
}: {
  title?: string;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <section aria-label="Next session" className="flex flex-col gap-2">
      <SectionHeader title={title} />
      {loading ? <SkeletonCard /> : children}
    </section>
  );
}

/** The next session's card: its weight as lifted, tier and scheme, then `children`. */
export function NextSessionCard({
  weight,
  unit,
  tier,
  scheme,
  isAMRAP,
  children,
}: {
  weight: number;
  unit: string;
  tier: Tier;
  /** "5×3+", "3×10". */
  scheme: string;
  isAMRAP: boolean;
  children?: ReactNode;
}) {
  const style = tierStyle(tier);
  const term = TIER_TERM[tier];
  return (
    <div data-testid="next-session" className="flex flex-col gap-2 rounded-xl bg-accent-primary-soft px-4 py-3">
      <div className="flex items-end justify-between gap-3">
        {weight > 0 ? (
          <p className="flex items-baseline gap-1.5">
            <b
              data-testid="next-weight"
              className="font-display text-[40px] leading-none font-extrabold text-foreground tabular-nums"
            >
              {weight}
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
          {isAMRAP ? <Term id="amrap-plus">{scheme}</Term> : <span>{scheme}</span>}
        </p>
      </div>
      {children}
    </div>
  );
}

/**
 * "Plan 190 · You 200" while the weight is set by hand (E7), what that means
 * (`children`), the rule behind it, and the way back to the plan's weight.
 */
export function PlanYouRow({
  planWeight,
  weight,
  evidence,
  backToPlan,
  children,
}: {
  planWeight: number;
  weight: number;
  evidence?: ReactNode;
  backToPlan: ReactNode;
  children: ReactNode;
}) {
  return (
    <div data-testid="plan-you" className="flex items-center gap-3 border-t border-border pt-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <PlanYou planWeight={planWeight} weight={weight} className="text-sm" />
        <p className="text-[13px] text-muted-foreground">{children}</p>
      </div>
      {evidence}
      {backToPlan}
    </div>
  );
}

/** "Wrong weight for next time?" and the Adjust weight sheet beside it. */
export function AdjustRow({ children, sheet }: { children: ReactNode; sheet: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="min-w-0 text-xs text-muted-foreground">{children}</p>
      {sheet}
    </div>
  );
}

/**
 * The next session's sets as chips (E5), bound to its next-session set plan (E6): a
 * change is kept for that session only; "Back to plan" (or setting every set back)
 * removes it. A save that fails says so in a toast.
 */
export function NextSetPlanEditor({
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
  // The next session's plan already has a stored set plan applied (`applyNextSetPlans`),
  // so "Plan" is the plan's own sets as they were when it was set.
  const plan = stored && stored.planSets.length > 0 ? stored.planSets : planSets;
  const sets = editorSets(stored, plan);
  if (plan.length === 0) return null;
  const save = (value: NextSetPlan | null) =>
    store.save(value, key).catch((e: unknown) =>
      toast({ message: `Could not save the set weights: ${e instanceof Error ? e.message : String(e)}` })
    );
  return (
    <div data-testid="next-set-plan" className="flex flex-col gap-1.5 border-t border-border pt-2">
      <p className="text-xs text-muted-foreground">Each set, next session only. Tap one to change it.</p>
      <SetPlanEditor
        name={name}
        sets={sets}
        planSets={plan}
        unit={unit}
        step={step}
        minWeight={minWeight}
        {...(maxWeight !== undefined ? { maxWeight } : {})}
        onChange={(next) => {
          if (!next || !differsFromPlan(next, plan)) {
            void save(null);
            return;
          }
          void save({ exerciseId, liftId, tier, sets: next, planSets: plan, createdAt: new Date().toISOString() });
        }}
      />
    </div>
  );
}
