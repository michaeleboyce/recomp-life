"use client";

import { useMemo } from "react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { useSettings, useStrengthEvidence } from "@/hooks";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { cn } from "@/lib/utils";
import { accessoryOutcomesOf, type AccessoryOutcome } from "@/lib/workout/accessoryPlan";
import type { WorkoutSession } from "@/types";
import { TierBadge } from "@/components/ui/tier-badge";
import { displayLiftName } from "@/components/Today/todayModel";

/**
 * What each accessory of a finished workout does next time, as of that workout
 * (`accessoryOutcomesOf`); undefined while loading, empty when it had none.
 */
export function useAccessoryOutcomes(workout: WorkoutSession | null | undefined): AccessoryOutcome[] | undefined {
  const sets = useStrengthEvidence();
  const settings = useSettings();
  return useMemo(() => {
    if (!workout || sets === undefined || settings === undefined) return undefined;
    const s = settings ?? DEFAULT_USER_PROFILE.settings;
    return accessoryOutcomesOf(workout, sets, s);
  }, [workout, sets, settings]);
}

/** One accessory's line: what it does next time and why. */
export function AccessoryOutcomeRow({ outcome, compact = false }: { outcome: AccessoryOutcome; compact?: boolean }) {
  const { verdict } = outcome.next;
  const Icon = verdict === "up" ? ArrowUpRight : verdict === "down" ? ArrowDownRight : Minus;
  const name = displayLiftName(outcome.exerciseId);
  if (compact) {
    return (
      <li data-outcome="accessory" className="border-t border-border py-2">
        <b className="text-[14px] font-semibold">
          {name} <span className="font-mono text-xs font-normal text-muted-foreground">Accessory</span>
        </b>
        <p className="text-xs text-muted-foreground">{outcome.text}</p>
      </li>
    );
  }
  return (
    <li data-outcome="accessory" className="flex min-h-11 items-center gap-3 border-b border-border py-2.5 last:border-b-0">
      <TierBadge tier="accessory" variant="soft" />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-foreground">{name}</p>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Icon className={cn("size-4 shrink-0", verdict === "up" ? "text-success" : verdict === "down" && "text-warning")} aria-hidden="true" />
          <span>{outcome.text}</span>
        </p>
      </div>
    </li>
  );
}
