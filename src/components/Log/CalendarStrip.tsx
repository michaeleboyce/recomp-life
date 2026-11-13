"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dayKey, daysInMonth, monthLabel, shiftMonth, type Month } from "./logEntries";

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "narrow" });
const FULL_DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });

/**
 * One month as a scrollable row of days. Days with entries carry a dot and a count in
 * their label; tapping one selects it, tapping it again clears the selection.
 */
export function CalendarStrip({
  month,
  onMonthChange,
  counts,
  selectedDay,
  onSelectDay,
  today,
}: {
  month: Month;
  onMonthChange: (month: Month) => void;
  /** Entries per day key, for the days to mark. */
  counts: Map<string, number>;
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
  today: Date;
}) {
  const scroller = useRef<HTMLOListElement>(null);
  const days = daysInMonth(month);
  const todayKey = dayKey(today);
  const focusKey = selectedDay ?? todayKey;

  // Bring the selected day (or today) into view inside the strip, not the page.
  useEffect(() => {
    const list = scroller.current;
    const target = list?.querySelector<HTMLElement>(`[data-day="${focusKey}"]`);
    if (list && target) {
      list.scrollLeft = target.offsetLeft - list.clientWidth / 2 + target.clientWidth / 2;
    }
  }, [focusKey, month]);

  return (
    <section aria-label="Calendar" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Previous month"
          onClick={() => onMonthChange(shiftMonth(month, -1))}
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Button>
        <h2 className="text-sm font-semibold text-foreground" aria-live="polite">
          {monthLabel(month)}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Next month"
          onClick={() => onMonthChange(shiftMonth(month, 1))}
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </Button>
      </div>
      <ol ref={scroller} className="relative flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
        {days.map((day) => {
          const key = dayKey(day);
          const count = counts.get(key) ?? 0;
          const selected = key === selectedDay;
          const isToday = key === todayKey;
          const label = `${FULL_DAY.format(day)}${isToday ? ", today" : ""}: ${
            count === 0 ? "nothing logged" : `${count} ${count === 1 ? "entry" : "entries"}`
          }`;
          return (
            <li key={key} data-day={key} className="shrink-0">
              <button
                type="button"
                aria-label={label}
                aria-pressed={selected}
                disabled={count === 0}
                onClick={() => onSelectDay(selected ? null : key)}
                className={cn(
                  "flex h-14 w-11 flex-col items-center justify-center gap-0.5 rounded-lg border text-xs outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  selected
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-transparent text-muted-foreground",
                  count > 0 && !selected && "text-foreground hover:bg-card",
                  count === 0 && "opacity-50",
                  isToday && !selected && "border-border"
                )}
              >
                <span aria-hidden="true">{WEEKDAY.format(day)}</span>
                <span
                  aria-hidden="true"
                  className={cn("font-mono text-sm tabular-nums", count > 0 && "font-semibold")}
                >
                  {day.getDate()}
                </span>
                <span
                  aria-hidden="true"
                  className={cn("size-1.5 rounded-full", count > 0 ? "bg-current" : "bg-transparent")}
                />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
