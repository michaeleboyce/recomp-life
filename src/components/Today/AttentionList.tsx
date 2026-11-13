"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, Info, Sparkles, type LucideIcon } from "lucide-react";
import { deletePainEntry, updatePainEntry } from "@/lib/data/records";
import { discardStaleWorkouts, discardWorkout } from "@/lib/data/workouts";
import type { Insight, InsightSeverity } from "@/lib/insights";
import { cn } from "@/lib/utils";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { SectionHeader } from "@/components/ui/section-header";

/** How many items show before "N more". */
const VISIBLE = 3;
/** Unfinished sessions older than this are no longer offered for resume. */
const STALE_WORKOUT_MS = 24 * 60 * 60 * 1000;

const ICON: Partial<Record<InsightSeverity, { Icon: LucideIcon; className: string }>> = {
  action: { Icon: AlertCircle, className: "text-warning" },
  warning: { Icon: AlertTriangle, className: "text-destructive" },
  info: { Icon: Info, className: "text-muted-foreground" },
};

/**
 * Where an insight sits in the list, or null when it is not attention at all.
 * Actions, then warnings, then the "worth knowing" ones: a T1 on its last stage or an
 * estimated 1RM that is slipping, and last the mild nudge after a few days off.
 * Positive insights are shown by PositiveInsightLine instead.
 */
function attentionRank(i: Insight): number | null {
  if (i.severity === "action") return 0;
  if (i.severity === "warning") return 1;
  if (i.severity === "info") return i.kind === "inactivity" ? 3 : 2;
  return null;
}

const isAttention = (i: Insight) => attentionRank(i) !== null;

/** The attention insights in display order (stable within a rank). */
function attentionItems(insights: Insight[]): Insight[] {
  return insights
    .filter(isAttention)
    .map((insight, index) => ({ insight, index, rank: attentionRank(insight)! }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ insight }) => insight);
}

/** Whether AttentionList would render anything for these insights. */
export const hasAttention = (insights: Insight[] | undefined): boolean =>
  Boolean(insights?.some(isAttention));

/** Whether PositiveInsightLine would render anything for these insights. */
export const hasPositive = (insights: Insight[] | undefined): boolean =>
  Boolean(insights?.some((i) => i.severity === "positive"));

/** Removes unfinished workouts older than a day (as the old abandoned-workout banner did). */
export function useDiscardStaleWorkouts(): void {
  useEffect(() => {
    discardStaleWorkouts(STALE_WORKOUT_MS).catch((err) =>
      console.error("Failed to clear stale workouts:", err)
    );
  }, []);
}

/**
 * "Needs attention": the action, warning and info insights, three at a time (the
 * rest behind "N more"). Renders nothing when there are none.
 */
export function AttentionList({ insights }: { insights: Insight[] }) {
  const [expanded, setExpanded] = useState(false);
  const items = attentionItems(insights);
  if (items.length === 0) return null;

  const shown = expanded ? items : items.slice(0, VISIBLE);
  const hidden = items.length - shown.length;

  return (
    <section aria-labelledby="attention-title" className="flex flex-col gap-1">
      <SectionHeader title={<span id="attention-title">Needs attention</span>} as="h2" className="mb-1" />
      <ul className="flex flex-col">
        {shown.map((item) => (
          <AttentionRow key={item.id} insight={item} />
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="self-start py-2 text-[13px] font-semibold text-primary"
        >
          {hidden} more
        </button>
      )}
    </section>
  );
}

function AttentionRow({ insight }: { insight: Insight }) {
  const icon = ICON[insight.severity] ?? ICON.action!;
  const { Icon } = icon;
  return (
    <li
      data-testid="attention-row"
      data-severity={insight.severity}
      className="flex gap-3 border-t border-border py-2.5 first:border-t-0"
    >
      <Icon className={cn("mt-0.5 size-[18px] shrink-0", icon.className)} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{insight.title}</p>
          {insight.evidenceId && <EvidenceLine ruleId={insight.evidenceId} variant="icon" />}
          {insight.action && (
            <Link
              href={insight.action.href}
              className="shrink-0 text-[13px] font-bold text-primary hover:underline"
            >
              {insight.action.label}
            </Link>
          )}
        </div>
        <p className="text-[13px] text-muted-foreground">{insight.body}</p>
        <RowExtras insight={insight} />
      </div>
    </li>
  );
}

/** One-tap answers that the old banners offered beside their link. */
function RowExtras({ insight }: { insight: Insight }) {
  const [busy, setBusy] = useState(false);
  const run = (task: () => Promise<void>) => {
    setBusy(true);
    task()
      .catch((err) => console.error("Failed to update:", err))
      .finally(() => setBusy(false));
  };
  const target = insight.id.slice(insight.id.indexOf(":") + 1);
  const buttonClass =
    "rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50";

  if (insight.kind === "pain-check") {
    return (
      <div className="flex gap-2 pt-1">
        <button type="button" disabled={busy} className={buttonClass} onClick={() => run(() => updatePainEntry(target, { date: new Date() }))}>
          Still there
        </button>
        <button type="button" disabled={busy} className={buttonClass} onClick={() => run(() => deletePainEntry(target))}>
          Resolved
        </button>
      </div>
    );
  }
  if (insight.kind === "unfinished-workout") {
    return (
      <div className="flex gap-2 pt-1">
        <button type="button" disabled={busy} className={cn(buttonClass, "text-destructive")} onClick={() => run(() => discardWorkout(target))}>
          Discard
        </button>
      </div>
    );
  }
  return null;
}

/** The top positive insight (a new best, say) as one quiet line; nothing if there is none. */
export function PositiveInsightLine({ insights }: { insights: Insight[] }) {
  const positive = insights.find((i) => i.severity === "positive");
  if (!positive) return null;
  return (
    <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <Sparkles className="size-4 shrink-0 text-success" aria-hidden="true" />
      <span className="min-w-0 flex-1">{positive.title}</span>
      {positive.evidenceId && <EvidenceLine ruleId={positive.evidenceId} variant="icon" />}
    </p>
  );
}
