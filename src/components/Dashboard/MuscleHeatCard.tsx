"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight } from "lucide-react";
import type { MuscleId } from "@/types";
import { db } from "@/db/local";
import { getMonday } from "@/lib/dates";
import { getWeeklyMuscleLoad, weeklyHeatLevels } from "@/lib/muscleLoad";
import { MUSCLE_IDS, formatMuscle } from "@/lib/muscles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MuscleMap } from "@/components/Anatomy/MuscleMap";
import { MuscleLegend } from "@/components/Anatomy/MuscleLegend";

/** Dashboard card: this week's training load drawn on the body. */
export default function MuscleHeatCard() {
  const weekWorkouts = useLiveQuery(async () => {
    const monday = getMonday(new Date());
    const nextMonday = new Date(monday);
    nextMonday.setDate(nextMonday.getDate() + 7);
    return db.workouts.where("startedAt").between(monday, nextMonday).toArray();
  });

  const load = getWeeklyMuscleLoad(weekWorkouts ?? [], getMonday(new Date()));
  const heat = weeklyHeatLevels(load);

  const ranked = (Object.entries(load) as [MuscleId, number][])
    .filter(([, sets]) => sets > 0)
    .sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 3);
  const untouched = MUSCLE_IDS.filter((m) => !load[m]);

  return (
    <Link href="/muscles" className="block" aria-label="Open the muscle explorer">
      <Card className="transition-colors hover:bg-accent/30 active:scale-[0.99]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Muscles This Week</CardTitle>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <MuscleMap
            heat={heat}
            className="h-36 shrink-0"
            label="Training load this week by muscle"
          />
          <div className="min-w-0 flex-1 space-y-2">
            {top.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Log a workout to see which muscles you have trained.
              </p>
            ) : (
              <>
                <ul className="space-y-1">
                  {top.map(([muscle, sets]) => (
                    <li key={muscle} className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">{formatMuscle(muscle)}</span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                        {Number.isInteger(sets) ? sets : sets.toFixed(1)} sets
                      </span>
                    </li>
                  ))}
                </ul>
                {untouched.length > 0 && (
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Not yet this week: {untouched.slice(0, 3).map(formatMuscle).join(", ")}
                    {untouched.length > 3 ? ` +${untouched.length - 3}` : ""}
                  </p>
                )}
              </>
            )}
            <MuscleLegend variant="weekly" className="justify-start" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
