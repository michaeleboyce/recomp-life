import type { NextSetPlan } from "@/types";
import { useSettings } from "./useProfile";

const NO_PLANS: Record<string, NextSetPlan> = {};

/**
 * The next-session set plans (`UserSettings.nextSetPlans`, E6), keyed by
 * `nextSetPlanKey(exerciseId, tier)`: an empty record when there are none or no
 * profile, `undefined` while loading. Write with `saveNextSetPlan`.
 */
export function useNextSetPlans(): Record<string, NextSetPlan> | undefined {
  const settings = useSettings();
  if (settings === undefined) return undefined;
  return settings?.nextSetPlans ?? NO_PLANS;
}
