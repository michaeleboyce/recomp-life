import { workoutDisplayName } from "@/lib/workoutNames";
import type { Insight, InsightContext } from "../types";
import { plural } from "../shared";

const workingSets = (session: { sets?: { tier: string }[] }) =>
  (session.sets ?? []).filter((s) => s.tier !== "warmup").length;

/** "Sun, Nov 8". */
function shortDay(value: Date | string): string {
  return new Date(value).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * The workout the user started and left: within a day, an offer to resume it; older
 * ones with working sets, a question (save as it was left, or discard), since they
 * are too old to pick up but hold sets that must not be lost.
 */
export function unfinishedWorkoutInsights(ctx: InsightContext): Insight[] {
  const out: Insight[] = [];
  const session = ctx.unfinishedWorkout;
  if (session) {
    const name = workoutDisplayName(session.templateId);
    const working = workingSets(session);
    const logged =
      working === 0
        ? `${name} was started but has no working sets logged.`
        : `${name} has ${plural(working, "working set")} logged.`;
    out.push({
      id: `unfinished-workout:${session.id}`,
      kind: "unfinished-workout",
      severity: "action",
      title: "Unfinished workout",
      body: `${logged} Resume it to pick up where you left off.`,
      action: { label: "Resume", href: `/workout/active?sessionId=${session.id}` },
    });
  }

  for (const left of ctx.leftWorkouts ?? []) {
    const working = workingSets(left);
    if (working === 0) continue;
    out.push({
      id: `left-workout:${left.id}`,
      kind: "left-workout",
      severity: "action",
      title: "Workout left unfinished",
      body: `${workoutDisplayName(left.templateId)} from ${shortDay(left.startedAt)} has ${plural(
        working,
        "working set"
      )} logged. End & save keeps them as that day's workout; Discard moves it to Recently deleted.`,
    });
  }
  return out;
}
