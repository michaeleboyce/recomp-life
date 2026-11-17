// Data layer: next-session set plans (E6), kept in the profile's settings JSON, which
// already syncs. Every write goes through `writeSettings`, as `updateSettings` does.
// Spec: docs/plans/2026-11-17-exercise-page-design.md.
import { db } from "@/db/local";
import { consumeNextSetPlans, withNextSetPlan } from "@/lib/workout/nextSetPlans";
import type { NextSetPlan, WorkoutSession } from "@/types";
import { readSettings } from "./derived";
import { requireProfile, writeSettings } from "./records";
import { sanitizeNextSetPlans } from "./settingsShape";

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
      // A stored plan too damaged to use goes with this write.
      nextSetPlans: withNextSetPlan(sanitizeNextSetPlans(profile.settings.nextSetPlans), key, plan),
    });
  });
}

/** The stored next-session set plans that can be used (an empty record when there are none). */
export async function readNextSetPlans(): Promise<Record<string, NextSetPlan>> {
  return sanitizeNextSetPlans((await readSettings()).nextSetPlans) ?? {};
}

/**
 * Removes the set plans a finished session used (it logged that exercise at that tier),
 * and any stored plan too damaged to use, which would otherwise stop the workout from
 * finishing. Joins the caller's transaction, which must include `db.userProfile`;
 * writes nothing when nothing is removed or there is no profile.
 */
export async function spendNextSetPlans(session: Pick<WorkoutSession, "sets">): Promise<void> {
  const profile = await db.userProfile.toCollection().first();
  const stored: unknown = profile?.settings.nextSetPlans;
  if (!profile || stored === undefined) return;
  const usable = sanitizeNextSetPlans(stored) ?? {};
  const left = consumeNextSetPlans(usable, session);
  const before = typeof stored === "object" && stored !== null ? Object.keys(stored).length : -1;
  if (Object.keys(left).length === before) return;
  await writeSettings(profile, { ...profile.settings, nextSetPlans: left });
}
