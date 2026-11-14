"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatWeekRange } from "@/lib/review";

const arrowClass =
  "inline-flex size-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none disabled:pointer-events-none disabled:text-muted-foreground/40";

/**
 * Previous / next week and the date range. The arrows step to the nearest week that
 * has data (the current week always counts); next is disabled on the current week.
 */
export function WeekSwitcher({
  weekStart,
  weeks,
  thisWeek,
  onChange,
}: {
  weekStart: Date;
  /** Weeks with data, newest first, including the current week. */
  weeks: Date[];
  thisWeek: Date;
  onChange: (week: Date) => void;
}) {
  const t = weekStart.getTime();
  const older = weeks.find((w) => w.getTime() < t);
  const newer = [...weeks].reverse().find((w) => w.getTime() > t);
  const isCurrent = t === thisWeek.getTime();

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex w-full items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous week"
          disabled={!older}
          onClick={() => older && onChange(older)}
          className={arrowClass}
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <p className="text-center" aria-live="polite">
          <span className="block font-mono text-base font-semibold tabular-nums text-foreground">
            {formatWeekRange(weekStart)}
          </span>
          {isCurrent && <span className="block text-xs text-muted-foreground">This week so far</span>}
        </p>
        <button
          type="button"
          aria-label="Next week"
          disabled={isCurrent || !newer}
          onClick={() => newer && onChange(newer)}
          className={arrowClass}
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>
      {!isCurrent && (
        <button
          type="button"
          onClick={() => onChange(thisWeek)}
          className="min-h-9 px-3 text-[13px] font-semibold text-primary"
        >
          This week so far
        </button>
      )}
    </div>
  );
}
