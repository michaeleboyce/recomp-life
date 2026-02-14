"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import {
  WORKOUT_TEMPLATES,
  getNextWorkoutId,
} from "@/lib/workoutTemplates";
import { EXERCISES } from "@/lib/exercises";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import type { WorkoutLocation } from "@/types";

export default function NextWorkoutCard() {
  const [location, setLocation] = useState<WorkoutLocation>("gym");

  const lastWorkout = useLiveQuery(async () => {
    const workouts = await db.workouts
      .orderBy("startedAt")
      .reverse()
      .limit(1)
      .toArray();
    return workouts[0] ?? null;
  });

  const liftStates = useLiveQuery(() => db.liftStates.toArray());

  const activePain = useLiveQuery(async () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const entries = await db.painEntries
      .where("date")
      .aboveOrEqual(sevenDaysAgo)
      .toArray();
    return entries.filter((e) => e.sensation === "pain");
  });

  const nextTemplateId = lastWorkout
    ? getNextWorkoutId(lastWorkout.templateId)
    : "A1";
  const template = WORKOUT_TEMPLATES[nextTemplateId];

  if (!template) return null;

  const t1Exercise = template.exercises.find((e) => e.tier === "T1");
  const t2Exercise = template.exercises.find((e) => e.tier === "T2");

  const t1State = t1Exercise
    ? liftStates?.find((s) => s.exerciseId === t1Exercise.exerciseId)
    : null;
  const t2State = t2Exercise
    ? liftStates?.find((s) => s.exerciseId === t2Exercise.exerciseId)
    : null;

  const t1Info = t1Exercise ? EXERCISES[t1Exercise.exerciseId] : null;
  const t2Info = t2Exercise ? EXERCISES[t2Exercise.exerciseId] : null;

  // Check if pain affects any exercises in this workout
  const painWarnings: string[] = [];
  if (activePain && activePain.length > 0) {
    for (const ex of template.exercises) {
      const exerciseInfo = EXERCISES[ex.exerciseId];
      if (!exerciseInfo) continue;
      for (const pain of activePain) {
        if (exerciseInfo.painSensitiveRegions.includes(pain.region)) {
          painWarnings.push(
            `${exerciseInfo.name} may be affected by ${pain.region.replace(/_/g, " ")} pain`
          );
        }
      }
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Next Workout</CardTitle>
          <Badge variant="outline" className="text-xs">
            {template.name}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Exercise list */}
        <div className="space-y-2">
          {t1Exercise && t1Info && (
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
              <div>
                <span className="text-xs font-semibold text-primary/70">
                  T1
                </span>
                <p className="text-sm font-medium text-foreground">
                  {location === "home" && t1Info.dumbbellAlternative
                    ? EXERCISES[t1Info.dumbbellAlternative]?.name ?? t1Info.name
                    : t1Info.name}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-foreground">
                  {t1State?.t1Weight ?? "—"} lbs
                </p>
                <p className="text-xs text-muted-foreground">
                  {t1State?.t1Stage ?? "5x3"}
                </p>
              </div>
            </div>
          )}
          {t2Exercise && t2Info && (
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
              <div>
                <span className="text-xs font-semibold text-primary/70">
                  T2
                </span>
                <p className="text-sm font-medium text-foreground">
                  {location === "home" && t2Info.dumbbellAlternative
                    ? EXERCISES[t2Info.dumbbellAlternative]?.name ?? t2Info.name
                    : t2Info.name}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-foreground">
                  {t2State?.t2Weight ?? "—"} lbs
                </p>
                <p className="text-xs text-muted-foreground">
                  {t2State?.t2Stage ?? "3x10"}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Pain warnings */}
        {painWarnings.length > 0 && (
          <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2">
            {painWarnings.map((warn, i) => (
              <p key={i} className="text-xs text-yellow-400">
                {"\u26A0\uFE0F"} {warn}
              </p>
            ))}
          </div>
        )}

        {/* Location toggle */}
        <div className="flex gap-2">
          <Button
            variant={location === "gym" ? "default" : "outline"}
            size="sm"
            onClick={() => setLocation("gym")}
            className="flex-1"
          >
            {"\uD83C\uDFCB\uFE0F"} GYM
          </Button>
          <Button
            variant={location === "home" ? "default" : "outline"}
            size="sm"
            onClick={() => setLocation("home")}
            className="flex-1"
          >
            {"\uD83C\uDFE0"} HOME
          </Button>
        </div>

        {/* Start workout button */}
        <Link href="/workout/configure" className="block">
          <Button className="w-full h-12 text-base font-bold" size="lg">
            START WORKOUT
          </Button>
        </Link>

        {/* Secondary buttons */}
        <div className="flex gap-2">
          <Link href="/run" className="flex-1">
            <Button variant="outline" size="sm" className="w-full">
              {"\uD83C\uDFC3"} Log a Run
            </Button>
          </Link>
          <Link href="/body-check" className="flex-1">
            <Button variant="outline" size="sm" className="w-full">
              {"\uD83E\uDE79"} Body Check
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
