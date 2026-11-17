"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { useImportedLiftIndex, useMetricSource, useStrengthEvidence, useVariantStates } from "@/hooks";
import type { RangeKey } from "@/lib/metrics/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { LiftList } from "./LiftList";
import { StrengthTotal } from "./StrengthTotal";
import { GymDebtSection, RecoverySection } from "./StrengthSections";
import { DEFAULT_MAX_DUMBBELL, gymDebtItems, recoveryRows } from "./sections";
import { strengthOverview } from "./strength";

/** Progress > Strength: the four-lift total, one row per lift, recovery and gym debt. */
export function StrengthTab() {
  const source = useMetricSource();
  const imported = useImportedLiftIndex();
  const variantStates = useVariantStates();
  // The evidence the gym plan reads, so "waiting for gym" gives the weight it will plan.
  const strengthSets = useStrengthEvidence();
  const [range, setRange] = useState<RangeKey>("3m");
  // Taken once per mount so the range window does not slide on every render.
  const [now] = useState(() => Date.now());

  const view = useMemo(() => {
    if (!source || !imported || !variantStates || !strengthSets) return undefined;
    const equipment = source.settings?.equipment ?? DEFAULT_USER_PROFILE.settings.equipment;
    const maxDumbbell = source.settings?.equipment?.maxDumbbellWeight ?? DEFAULT_MAX_DUMBBELL;
    return {
      // Imported sessions of each lift are history too (marked imported).
      overview: strengthOverview(source, range, now, imported),
      recovery: recoveryRows(
        source.liftStates,
        new Date(now),
        source.settings?.trainingPhase ?? { mode: "maintaining" },
        variantStates
      ),
      gymDebt: gymDebtItems({
        liftStates: source.liftStates,
        variantStates,
        strengthSets,
        equipment: { ...equipment, maxDumbbellWeight: maxDumbbell },
      }),
      maxDumbbell,
    };
  }, [source, imported, variantStates, strengthSets, range, now]);

  if (!view) {
    return (
      <div className="space-y-4" aria-busy="true">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {view.overview.hasData ? (
        <>
          <StrengthTotal total={view.overview.total} range={range} onRangeChange={setRange} />
          <LiftList lifts={view.overview.lifts} />
        </>
      ) : (
        <EmptyState
          icon={<Dumbbell />}
          title="No lifts logged yet"
          body="Finish a workout and your estimated 1RM for each lift shows up here."
          action={
            <Button asChild>
              <Link href="/workout/configure">Start a workout</Link>
            </Button>
          }
        />
      )}
      <RecoverySection rows={view.recovery} />
      <GymDebtSection items={view.gymDebt} maxDumbbellWeight={view.maxDumbbell} />
    </div>
  );
}
