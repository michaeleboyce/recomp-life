"use client";
// TEMPORARY ADAPTER (package P2): reads and writes `UserSettings.nextSetPlans` until
// package P1's `useNextSetPlans()` and `saveNextSetPlan(plan, key)` land in src/hooks.
// At integration, swap the body of `useNextSetPlanStore` for those two calls; the
// page only uses this hook.
import { useCallback } from "react";
import { useSettings } from "@/hooks";
import { updateSettings } from "@/lib/data/records";
import type { NextSetPlan } from "@/types";

export interface NextSetPlanStore {
  /** The stored next-session set plans; undefined while loading. */
  plans: Readonly<Record<string, NextSetPlan>> | undefined;
  /** Saves `plan` under `key`, or removes it when null. */
  save: (plan: NextSetPlan | null, key: string) => Promise<void>;
}

export function useNextSetPlanStore(): NextSetPlanStore {
  const settings = useSettings();
  const plans = settings === undefined ? undefined : (settings?.nextSetPlans ?? {});
  const save = useCallback(
    async (plan: NextSetPlan | null, key: string) => {
      const next = { ...(plans ?? {}) };
      if (plan) next[key] = plan;
      else delete next[key];
      await updateSettings({ nextSetPlans: next });
    },
    [plans]
  );
  return { plans, save };
}
