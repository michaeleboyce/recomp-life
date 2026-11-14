"use client";

import { useState } from "react";
import { formatDay } from "@/components/LogEdit/format";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import type { LiftAdjustment } from "@/types";
import { weightChangeRows } from "./adjustmentRows";

const FIRST_PAGE = 5;

/**
 * Why the lift's weight is what it is, apart from the sessions: starting weights,
 * manual changes and time-off reductions, newest first. Nothing while loading or
 * when there is none.
 */
export function WeightChanges({ adjustments }: { adjustments: LiftAdjustment[] | undefined }) {
  const [showAll, setShowAll] = useState(false);
  if (!adjustments || adjustments.length === 0) return null;
  const rows = weightChangeRows(adjustments);
  const visible = showAll ? rows : rows.slice(0, FIRST_PAGE);

  return (
    <section aria-label="Weight changes">
      <SectionHeader title="Weight changes" className="mb-0.5" />
      <ul>
        {visible.map((row) => (
          <li
            key={row.id}
            data-testid="weight-change"
            className="flex min-h-[52px] flex-col justify-center gap-0.5 border-b border-border py-2 last:border-b-0"
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-foreground">{row.source}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {row.t === null ? "Before the first workout" : formatDay(new Date(row.t))}
              </span>
            </span>
            <span className="font-mono text-[13px] tabular-nums text-muted-foreground">
              {row.detail}
            </span>
            {row.note && <span className="text-xs text-muted-foreground">{row.note}</span>}
          </li>
        ))}
      </ul>
      {!showAll && rows.length > FIRST_PAGE && (
        <Button variant="ghost" className="mt-2 h-11 w-full" onClick={() => setShowAll(true)}>
          Show all {rows.length}
        </Button>
      )}
    </section>
  );
}
