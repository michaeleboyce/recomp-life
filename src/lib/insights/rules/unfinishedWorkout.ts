import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { Insight, InsightContext } from "../types";
import { plural } from "../shared";

/** The workout the user started and left; offers to resume it. */
export function unfinishedWorkoutInsights(ctx: InsightContext): Insight[] {
  const session = ctx.unfinishedWorkout;
  if (!session) return [];

  const name = WORKOUT_TEMPLATES[session.templateId]?.name ?? `Workout ${session.templateId}`;
  const working = (session.sets ?? []).filter((s) => s.tier !== "warmup").length;
  const logged =
    working === 0
      ? `${name} was started but has no working sets logged.`
      : `${name} has ${plural(working, "working set")} logged.`;

  return [
    {
      id: `unfinished-workout:${session.id}`,
      kind: "unfinished-workout",
      severity: "action",
      title: "Unfinished workout",
      body: `${logged} Resume it to pick up where you left off.`,
      action: { label: "Resume", href: `/workout/active?sessionId=${session.id}` },
    },
  ];
}
