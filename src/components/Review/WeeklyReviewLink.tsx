"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck, ChevronRight } from "lucide-react";
import { formatWeekRange, previousWeek, weekKey, weekOf } from "@/lib/review";

/** Sunday (0) and Monday (1): when last week, or the week just ending, is worth a look. */
export function isReviewDay(now: Date): boolean {
  return now.getDay() === 0 || now.getDay() === 1;
}

/**
 * A quiet line for Today on Sundays and Mondays. Sunday links to the week ending
 * today; Monday to the week that just finished. Renders nothing on other days.
 */
export function WeeklyReviewLink({ now: fixedNow }: { now?: Date }) {
  const [mountNow] = useState(() => new Date());
  const now = fixedNow ?? mountNow;
  if (!isReviewDay(now)) return null;
  const week = now.getDay() === 0 ? weekOf(now) : previousWeek(weekOf(now));
  return (
    <Link
      href={`/progress/review?week=${weekKey(week)}`}
      className="flex min-h-11 items-center gap-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
    >
      <CalendarCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        Your week in review, {formatWeekRange(week)}
      </span>
      <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
    </Link>
  );
}
