"use client";

import { useLiveQuery } from "dexie-react-hooks";
import type { BodyRegion, PainSorenessEntry } from "@/types";
import { formatRegion } from "@/lib/painModifications";
import { db } from "@/db/local";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface PainHistoryProps {
  region: BodyRegion | null;
}

function formatDate(date: Date): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysSince(date: Date): number {
  const now = new Date();
  const then = new Date(date);
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

function AutoClearPrompt({
  entry,
  onResolve,
  onStillThere,
}: {
  entry: PainSorenessEntry;
  onResolve: (id: string) => void;
  onStillThere: (id: string) => void;
}) {
  return (
    <div className="mt-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
      <p className="text-xs text-amber-300 mb-2">
        This pain entry is over 7 days old. Still bothering you?
      </p>
      <div className="flex gap-2">
        <Button
          size="xs"
          variant="outline"
          onClick={() => onStillThere(entry.id)}
          className="text-xs"
        >
          Still there
        </Button>
        <Button
          size="xs"
          variant="default"
          onClick={() => onResolve(entry.id)}
          className="text-xs"
        >
          Resolved!
        </Button>
      </div>
    </div>
  );
}

export default function PainHistory({ region }: PainHistoryProps) {
  // Query recent entries for this region, sorted by date descending
  const entries = useLiveQuery(
    async () => {
      if (!region) return [];
      return db.painEntries
        .where("region")
        .equals(region)
        .reverse()
        .sortBy("date");
    },
    [region],
    []
  );

  const handleResolve = async (id: string) => {
    await db.painEntries.delete(id);
  };

  const handleStillThere = async (id: string) => {
    // Update the date to "refresh" the entry so it doesn't prompt again right away
    await db.painEntries.update(id, { date: new Date() });
  };

  if (!region || !entries || entries.length === 0) {
    return null;
  }

  // Show only the 10 most recent entries
  const recentEntries = entries.slice(0, 10);

  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium text-foreground mb-2">
        Recent History &mdash; {formatRegion(region)}
      </h3>
      <div className="space-y-2">
        {recentEntries.map((entry) => {
          const age = daysSince(entry.date);
          const needsAutoClear =
            entry.sensation === "pain" && age > 7;

          return (
            <div
              key={entry.id}
              className="rounded-md border border-border bg-card p-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      entry.sensation === "pain" ? "destructive" : "secondary"
                    }
                  >
                    {entry.sensation}
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground">
                    {entry.severity}/5
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDate(entry.date)}
                  {age > 0 && (
                    <span className="ml-1">
                      ({age}d ago)
                    </span>
                  )}
                </span>
              </div>
              {entry.notes && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.notes}
                </p>
              )}
              {needsAutoClear && (
                <AutoClearPrompt
                  entry={entry}
                  onResolve={handleResolve}
                  onStillThere={handleStillThere}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
