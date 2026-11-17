// Data layer: next-session set plans (E6), kept in the profile's settings JSON, which
// already syncs. Every write goes through `writeSettings`, as `updateSettings` does.
// Spec: docs/plans/2026-11-17-exercise-page-design.md.
import { db } from "@/db/local";
import { consumeNextSetPlans, withNextSetPlan } from "@/lib/workout/nextSetPlans";
import type { NextSetPlan, WorkoutSession } from "@/types";
import { readSettings } from "./derived";
import { requireProfile, writeSettings } from "./records";

/**
 * Sets the next-session set plan at `key` (`nextSetPlanKey(exerciseId, tier)`), or
 * removes it when `plan` is null. Read and written in one transaction, so two quick
 * saves (or two tabs) never lose one. Rejects when there is no profile.
 */
export async function saveNextSetPlan(plan: NextSetPlan | null, key: string): Promise<void> {
  await db.transaction("rw", db.userProfile, async () => {
    const profile = await requireProfile();
    await writeSettings(profile, {
      ...profile.settings,
      nextSetPlans: withNextSetPlan(profile.settings.nextSetPlans, key, plan),
    });
  });
}

/** The stored next-session set plans (an empty record when there are none). */
export async function readNextSetPlans(): Promise<Record<string, NextSetPlan>> {
  return { ...((await readSettings()).nextSetPlans ?? {}) };
}

/**
 * Removes the set plans a finished session used (it logged that exercise at that tier).
 * Joins the caller's transaction, which must include `db.userProfile`; writes nothing
 * when no plan was used or there is no profile.
 */
export async function spendNextSetPlans(session: Pick<WorkoutSession, "sets">): Promise<void> {
  const profile = await db.userProfile.toCollection().first();
  const plans = profile?.settings.nextSetPlans;
  if (!profile || !plans) return;
  const left = consumeNextSetPlans(plans, session);
  if (Object.keys(left).length === Object.keys(plans).length) return;
  await writeSettings(profile, { ...profile.settings, nextSetPlans: left });
}
