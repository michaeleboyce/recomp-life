"use client";
// The page's handle on next-session set plans (E6): P1's `useNextSetPlans` and
// `saveNextSetPlan`, behind one hook so the components and their tests use one seam.
import { saveNextSetPlan, useNextSetPlans } from "@/hooks";
import type { NextSetPlan } from "@/types";

export interface NextSetPlanStore {
  /** The stored next-session set plans; undefined while loading. */
  plans: Readonly<Record<string, NextSetPlan>> | undefined;
  /** Saves `plan` under `key`, or removes it when null. Rejects when it cannot be saved. */
  save: (plan: NextSetPlan | null, key: string) => Promise<void>;
}

export function useNextSetPlanStore(): NextSetPlanStore {
  return { plans: useNextSetPlans(), save: saveNextSetPlan };
}
