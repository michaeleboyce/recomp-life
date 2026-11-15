"use client";

import { useMemo } from "react";
import { Telescope } from "lucide-react";
import { useScoredForecasts } from "@/hooks";
import { summarize } from "@/lib/forecast";
import { ListRow } from "@/components/ui/list-row";
import { judgeShare, openForecasts } from "./forecastText";

/**
 * The Progress hub's way into Forecasts: how many are open and, once there are enough
 * results to judge, the share that landed inside their range.
 */
export function ForecastsEntry() {
  const scored = useScoredForecasts();
  const summary = useMemo(() => {
    if (!scored) return undefined;
    const open = openForecasts(scored, new Date());
    const record = summarize(scored);
    return {
      total: scored.length,
      open: open.today.length + open.ahead.length,
      share: judgeShare(record.ranges.inside, record.ranges.n, "inside the range"),
    };
  }, [scored]);

  let subtitle = "What the app predicts, and how right it has been";
  if (summary && summary.total === 0) subtitle = "They start with your next workout";
  else if (summary) subtitle = `${summary.open} open · and how right they have been`;

  return (
    <ListRow
      href="/progress/forecasts"
      title="Forecasts"
      subtitle={subtitle}
      value={summary?.share.enough ? summary.share.value : undefined}
      valueSub={
        summary?.share.enough ? <span className="text-muted-foreground">on target</span> : undefined
      }
      leading={<Telescope className="size-5 text-primary" aria-hidden="true" />}
      className="rounded-[14px] border-b-0 bg-card px-3.5"
    />
  );
}
