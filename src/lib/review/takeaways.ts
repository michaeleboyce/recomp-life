// The weekly review's takeaways: at most three plain sentences chosen by fixed rules.
// No coaching numbers are invented here: every threshold is an existing constant
// (the session target, rateOfLoss zones through paceStatus) or an insight. Pure.
//
// Rules, in order; the first three that apply are kept:
//  1. Insights (only when they describe this week: the current week or the most recent
//     completed one), warnings and actions first, of the kinds the review covers:
//     deload, strength-stall, loss-rate, fat-loss-stall. The insight's own title is the
//     sentence and its body the detail.
//  2. New bests: "New best estimated 1RM on squat and bench."
//  3. Sessions against the target: "Hit the target: 5 of 5 sessions." or
//     "3 of 5 sessions (4 the week before)." Written for a finished week, or for the
//     current week once it has a session.
//  4. Positive and info insights of the same kinds (e.g. "Weight loss on pace").
//  5. For an older week while cutting (no insight describes it), the pace word from
//     paceStatus: "Weight loss on pace", "slower than target", "faster than target",
//     "Weight went up".
// An empty week has no takeaways.
import { getRule, type RuleId } from "@/lib/evidence";
import type { Insight, InsightKind } from "@/lib/insights";
import { joinList } from "@/lib/insights/shared";
import { isMainLift, LIFT_NAMES } from "@/components/Progress/lifts";
import type { PaceWord } from "@/components/Progress/body/bodyMath";
import { nextWeek } from "./weeks";
import type { Takeaway, TakeawayTone, WeeklyReview } from "./types";

export const MAX_TAKEAWAYS = 3;

/** Insight kinds the review repeats; the rest (unfinished workout, weigh-in due...) are about today. */
export const REVIEW_INSIGHT_KINDS: readonly InsightKind[] = [
  "deload",
  "strength-stall",
  "loss-rate",
  "fat-loss-stall",
];

/** Only rules that are live in the evidence registry are cited. */
export function activeEvidence(id: RuleId | undefined): RuleId | undefined {
  return id && getRule(id).status === "active" ? id : undefined;
}

/** Whether insights computed at `now` describe the week: this week or the one just finished. */
export function insightsDescribeWeek(weekStart: Date, now: Date): boolean {
  const end = nextWeek(weekStart).getTime();
  const followingEnd = nextWeek(new Date(end)).getTime();
  return now.getTime() >= weekStart.getTime() && now.getTime() < followingEnd;
}

function insightHref(insight: Insight): string {
  if (insight.action) return insight.action.href;
  if (insight.kind === "loss-rate" || insight.kind === "fat-loss-stall") return "/progress/body";
  const target = insight.id.slice(insight.id.indexOf(":") + 1);
  return isMainLift(target) ? `/progress/lift/${target}` : "/progress";
}

const TONE: Record<Insight["severity"], TakeawayTone> = {
  action: "warn",
  warning: "warn",
  info: "info",
  positive: "good",
};

function fromInsight(insight: Insight): Takeaway {
  return {
    id: `insight:${insight.id}`,
    tone: TONE[insight.severity],
    text: `${insight.title}.`,
    detail: insight.body,
    href: insightHref(insight),
    evidenceId: activeEvidence(insight.evidenceId),
  };
}

const PACE_TEXT: Record<PaceWord, { text: string; tone: TakeawayTone }> = {
  "on pace": { text: "Weight loss was on pace.", tone: "good" },
  slow: { text: "Weight loss was slower than target.", tone: "warn" },
  fast: { text: "Weight loss was faster than target.", tone: "warn" },
  gaining: { text: "Weight went up while cutting.", tone: "warn" },
};

type Measured = Omit<WeeklyReview, "takeaways">;

export function buildTakeaways(review: Measured, insights: Insight[], now: Date): Takeaway[] {
  if (review.isEmpty) return [];
  const relevant = insightsDescribeWeek(review.weekStart, now)
    ? insights.filter((i) => REVIEW_INSIGHT_KINDS.includes(i.kind))
    : [];
  const urgent = relevant.filter((i) => i.severity === "action" || i.severity === "warning");
  const calm = relevant.filter((i) => i.severity === "info" || i.severity === "positive");
  const out: Takeaway[] = urgent.map(fromInsight);

  if (review.prs.length > 0) {
    const names = review.prs.map((p) => LIFT_NAMES[p.liftId].short);
    out.push({
      id: "prs",
      tone: "good",
      text: `New best estimated 1RM on ${joinList(names)}.`,
      href: review.prs.length === 1 ? `/progress/lift/${review.prs[0].liftId}` : "/progress",
      evidenceId: activeEvidence("e1rm-estimate"),
    });
  }

  const { count, target, previous } = review.sessions;
  const finished = nextWeek(review.weekStart).getTime() <= now.getTime();
  if (target !== null && (finished || count > 0)) {
    const hit = count >= target;
    const so = finished ? "" : " so far";
    out.push({
      id: "sessions",
      tone: hit ? "good" : "info",
      text: hit
        ? `Hit the target: ${count} of ${target} sessions${so}.`
        : `${count} of ${target} sessions${so} (${previous} the week before).`,
      href: "/log",
    });
  }

  out.push(...calm.map(fromInsight));

  const body = review.bodyweight;
  if (relevant.length === 0 && body?.cutting && body.pace) {
    out.push({
      id: "pace",
      ...PACE_TEXT[body.pace],
      href: "/progress/body",
      evidenceId: activeEvidence("rate-of-loss"),
    });
  }
  return out.slice(0, MAX_TAKEAWAYS);
}
