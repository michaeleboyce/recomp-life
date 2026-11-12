"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { PainSorenessEntry } from "@/types";

interface PainSummaryProps {
  /** Entries from the last 7 days, newest first. */
  entries: PainSorenessEntry[];
}

const SHOWN = 3;

/** Recent pain and soreness entries, with the way to log a new one. */
export function PainSummary({ entries }: PainSummaryProps) {
  return (
    <div className="space-y-3">
      {entries.length > 0 && (
        <div className="space-y-1.5 rounded-lg bg-warning-soft p-3">
          <p className="text-xs font-semibold text-warning">Active entries (last 7 days)</p>
          {entries.slice(0, SHOWN).map((entry) => (
            <p key={entry.id} className="text-xs text-muted-foreground">
              {entry.region.replace(/_/g, " ")}: {entry.sensation} (severity {entry.severity}/5)
            </p>
          ))}
          {entries.length > SHOWN && (
            <p className="text-xs text-muted-foreground">+{entries.length - SHOWN} more</p>
          )}
        </div>
      )}
      <Button asChild variant="outline" className="h-11 w-full">
        <Link href="/body-check">Log pain/soreness</Link>
      </Button>
    </div>
  );
}
