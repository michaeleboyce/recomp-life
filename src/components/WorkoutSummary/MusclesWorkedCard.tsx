"use client";

import { useMemo } from "react";
import type { MuscleId, SetLog } from "@/types";
import { calculateMuscleLoad, relativeHeatLevels } from "@/lib/muscleLoad";
import { formatMuscle } from "@/lib/muscles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Anatomy3D } from "@/components/Anatomy/Anatomy3D";
import { MuscleLegend } from "@/components/Anatomy/MuscleLegend";

function formatSets(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Workout summary card: the session's training load on the 3D body. */
export default function MusclesWorkedCard({ sets }: { sets: SetLog[] }) {
  const { heat, ranked } = useMemo(() => {
    const load = calculateMuscleLoad(sets);
    return {
      heat: relativeHeatLevels(load),
      ranked: (Object.entries(load) as [MuscleId, number][])
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]),
    };
  }, [sets]);

  if (ranked.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Muscles Worked</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Anatomy3D heat={heat} className="h-72" label="Muscles worked in this workout" />
        <MuscleLegend variant="session" />
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
          {ranked.slice(0, 8).map(([muscle, value]) => (
            <li
              key={muscle}
              data-muscle={muscle}
              className="flex items-baseline justify-between gap-2 text-sm"
            >
              <span className="truncate">{formatMuscle(muscle)}</span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {formatSets(value)} sets
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
