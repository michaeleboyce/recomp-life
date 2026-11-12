"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import {
  WORKOUT_TEMPLATES,
  getNextWorkoutId,
} from "@/lib/workoutTemplates";
import { EXERCISES } from "@/lib/exercises";
import { combinedActivationHeat } from "@/lib/muscleLoad";
import { MuscleMap } from "@/components/Anatomy/MuscleMap";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { Dumbbell, Home, Activity, Camera } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import type { WorkoutLocation, EquipmentProfile } from "@/types";

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

  const userProfile = useLiveQuery(() => db.userProfile.toCollection().first());
  const equipment: EquipmentProfile | undefined = userProfile?.settings?.equipment;

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

  const t1Adaptation = (() => {
    if (location !== "home" || !t1Info || !t1State || !equipment) return null;
    const sub = t1Info.dumbbellAlternative ? EXERCISES[t1Info.dumbbellAlternative] : undefined;
    return adaptExerciseForHome(t1Info, t1State.t1Weight, equipment, sub);
  })();

  const t2Adaptation = (() => {
    if (location !== "home" || !t2Info || !t2State || !equipment) return null;
    const sub = t2Info.dumbbellAlternative ? EXERCISES[t2Info.dumbbellAlternative] : undefined;
    return adaptExerciseForHome(t2Info, t2State.t2Weight, equipment, sub);
  })();

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
    <Card variant="raised">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Next Workout</CardTitle>
          <div className="flex items-center gap-3">
            <MuscleMap
              heat={combinedActivationHeat(template.exercises.map((e) => e.exerciseId))}
              className="h-14"
              label={`Muscles ${template.name} targets`}
            />
            <Badge variant="outline" className="text-xs">
              {template.name}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Exercise list */}
        <div className="space-y-0">
          {t1Exercise && t1Info && (
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
              <div>
                <span className="text-xs font-semibold text-primary/70">
                  T1
                </span>
                <p className="text-sm font-medium text-foreground">
                  {location === "home" && t1Adaptation
                    ? t1Adaptation.adaptedExercise.name
                    : t1Info.name}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-foreground font-mono tabular-nums">
                  {location === "home" && t1Adaptation
                    ? t1Adaptation.adaptedWeight
                    : t1State?.t1Weight ?? "—"}{" "}
                  lbs
                  {location === "home" &&
                    t1Adaptation?.adaptedExercise.grip === "per_hand" &&
                    "/hand"}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  {t1State?.t1Stage ?? "5x3"}
                </p>
                {location === "home" &&
                  t1Adaptation?.adaptationStatus === "exceeds" && (
                    <p className="text-xs text-yellow-400">capped</p>
                  )}
              </div>
            </div>
          )}
          {t1Exercise && t2Exercise && <Separator className="my-1" />}
          {t2Exercise && t2Info && (
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
              <div>
                <span className="text-xs font-semibold text-primary/70">
                  T2
                </span>
                <p className="text-sm font-medium text-foreground">
                  {location === "home" && t2Adaptation
                    ? t2Adaptation.adaptedExercise.name
                    : t2Info.name}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-foreground font-mono tabular-nums">
                  {location === "home" && t2Adaptation
                    ? t2Adaptation.adaptedWeight
                    : t2State?.t2Weight ?? "—"}{" "}
                  lbs
                  {location === "home" &&
                    t2Adaptation?.adaptedExercise.grip === "per_hand" &&
                    "/hand"}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  {t2State?.t2Stage ?? "3x10"}
                </p>
                {location === "home" &&
                  t2Adaptation?.adaptationStatus === "exceeds" && (
                    <p className="text-xs text-yellow-400">capped</p>
                  )}
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

        {/* Location segmented control */}
        <SegmentedControl
          value={location}
          onChange={setLocation}
          options={[
            { value: "gym" as const, label: "Gym", icon: <Dumbbell className="h-4 w-4" /> },
            { value: "home" as const, label: "Home", icon: <Home className="h-4 w-4" /> },
          ]}
        />

        {/* Start workout button */}
        <Link href="/workout/configure" className="block">
          <Button className="w-full h-12 text-base font-bold active:scale-[1.02] transition-transform" size="lg">
            START WORKOUT
          </Button>
        </Link>

        {/* Secondary buttons */}
        <div className="flex gap-2">
          <Link href="/activity" className="flex-1">
            <Button variant="outline" size="sm" className="w-full">
              <Activity className="h-4 w-4" /> Log Activity
            </Button>
          </Link>
          <Link href="/body-check" className="flex-1">
            <Button variant="outline" size="sm" className="w-full">
              <Camera className="h-4 w-4" /> Body Check
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
