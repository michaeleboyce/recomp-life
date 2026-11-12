import { getExpiredPainEntries } from "@/lib/painAutoClear";
import type { Insight, InsightContext } from "../types";
import { DAY_MS, toDate } from "../shared";

/** One "still there?" check per pain entry older than 7 days (replaces the Dashboard prompt). */
export function painCheckInsights(ctx: InsightContext): Insight[] {
  return getExpiredPainEntries(ctx.pain, ctx.now).map((entry): Insight => {
    const days = Math.floor((ctx.now.getTime() - toDate(entry.date).getTime()) / DAY_MS);
    const region = entry.region.replace(/_/g, " ");
    return {
      id: `pain-check:${entry.id}`,
      kind: "pain-check",
      severity: "action",
      title: `Is your ${region} pain still there?`,
      body: `You logged it ${days} days ago (severity ${entry.severity} of 5). Mark it resolved if it has cleared, or keep it if not.`,
      evidenceId: "training-with-pain",
      action: { label: "Review", href: "/body-check" },
    };
  });
}
