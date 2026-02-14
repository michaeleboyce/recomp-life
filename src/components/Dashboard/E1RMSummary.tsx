"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import { getE1RMTrend, type E1RMTrend } from "@/lib/e1rm";
import { EXERCISES } from "@/lib/exercises";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const MAIN_LIFTS = ["squat", "bench", "deadlift", "ohp"] as const;

const TREND_ICONS: Record<E1RMTrend, { symbol: string; color: string }> = {
  increasing: { symbol: "\u2191", color: "text-green-400" },
  decreasing: { symbol: "\u2193", color: "text-red-400" },
  stable: { symbol: "\u2192", color: "text-muted-foreground" },
  insufficient_data: { symbol: "", color: "text-muted-foreground" },
};

export default function E1RMSummary() {
  const liftStates = useLiveQuery(() => db.liftStates.toArray());

  const latestE1RMs = useLiveQuery(async () => {
    const results: Record<string, number | null> = {};
    for (const liftId of MAIN_LIFTS) {
      const entries = await db.estimated1RMs
        .where("exerciseId")
        .equals(liftId)
        .reverse()
        .sortBy("date");
      results[liftId] = entries.length > 0 ? entries[0].estimated1RM : null;
    }
    return results;
  });

  if (!liftStates || !latestE1RMs) return null;

  const hasAnyE1RM = Object.values(latestE1RMs).some((v) => v !== null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Estimated 1RMs</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasAnyE1RM ? (
          <p className="text-sm text-muted-foreground">
            Complete AMRAP sets to see your estimated 1RMs.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {MAIN_LIFTS.map((liftId) => {
              const exercise = EXERCISES[liftId];
              const state = liftStates.find((s) => s.exerciseId === liftId);
              const e1rm = latestE1RMs[liftId];
              const trend = state
                ? getE1RMTrend(state.recentE1RMs)
                : "insufficient_data";
              const trendInfo = TREND_ICONS[trend];

              return (
                <div
                  key={liftId}
                  className="rounded-lg bg-muted/50 px-3 py-2 text-center"
                >
                  <p className="text-xs text-muted-foreground truncate">
                    {exercise?.name ?? liftId}
                  </p>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <span className="text-lg font-bold text-foreground">
                      {e1rm !== null ? `${e1rm}` : "—"}
                    </span>
                    {e1rm !== null && trendInfo.symbol && (
                      <span className={`text-sm ${trendInfo.color}`}>
                        {trendInfo.symbol}
                      </span>
                    )}
                  </div>
                  {e1rm !== null && (
                    <p className="text-xs text-muted-foreground">lbs</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
