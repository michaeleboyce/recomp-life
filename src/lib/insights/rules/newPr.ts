import { isNewPR } from "@/lib/e1rm";
import type { Estimated1RM } from "@/types";
import type { Insight, InsightContext } from "../types";
import { DAY_MS, formatLbs, isValidDate, liftName, toDate } from "../shared";

const RECENT_DAYS = 7;

/**
 * Per lift: the most recent e1RM row is a best ever (isNewPR against every earlier row)
 * and is from the last 7 days. A first-ever row is not reported: there is no gain to show.
 */
export function newPrInsights(ctx: InsightContext): Insight[] {
  const now = ctx.now.getTime();
  const byLift = new Map<string, { t: number; id: string; value: number }[]>();
  for (const row of ctx.e1rms as Estimated1RM[]) {
    const d = toDate(row.date);
    if (!isValidDate(d) || d.getTime() > now || !Number.isFinite(row.estimated1RM)) continue;
    const list = byLift.get(row.exerciseId) ?? [];
    list.push({ t: d.getTime(), id: row.id, value: row.estimated1RM });
    byLift.set(row.exerciseId, list);
  }

  const out: Insight[] = [];
  for (const [exerciseId, rows] of byLift) {
    rows.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
    const latest = rows[rows.length - 1];
    const previous = rows.slice(0, -1).map((r) => r.value);
    if (previous.length === 0) continue;
    if (now - latest.t > RECENT_DAYS * DAY_MS) continue;
    if (!isNewPR(latest.value, previous)) continue;

    const prevBest = Math.max(...previous);
    out.push({
      id: `new-pr:${exerciseId}`,
      kind: "new-pr",
      severity: "positive",
      title: `New best on ${liftName(exerciseId)}`,
      body: `Estimated 1RM ${formatLbs(latest.value)} lbs, up ${formatLbs(latest.value - prevBest)} lbs on your previous best of ${formatLbs(prevBest)} lbs.`,
      evidenceId: "e1rm-estimate",
    });
  }
  return out;
}
