"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import { EXERCISES } from "@/lib/exercises";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { Card, CardContent } from "@/components/ui/card";

export default function GymDebtBanner() {
  const lastWorkout = useLiveQuery(async () => {
    const workouts = await db.workouts
      .orderBy("startedAt")
      .reverse()
      .limit(1)
      .toArray();
    return workouts[0] ?? null;
  });

  if (!lastWorkout) return null;
  if (!lastWorkout.completedAt) return null;

  const template = WORKOUT_TEMPLATES[lastWorkout.templateId];
  if (!template) return null;

  const duration = lastWorkout.totalDurationSeconds;
  const completedAt = new Date(lastWorkout.completedAt);
  const now = new Date();
  const hoursAgo = Math.floor(
    (now.getTime() - completedAt.getTime()) / (1000 * 60 * 60)
  );
  const daysAgo = Math.floor(hoursAgo / 24);

  let timeLabel: string;
  if (daysAgo === 0) {
    if (hoursAgo === 0) timeLabel = "just now";
    else timeLabel = `${hoursAgo}h ago`;
  } else if (daysAgo === 1) {
    timeLabel = "yesterday";
  } else {
    timeLabel = `${daysAgo} days ago`;
  }

  const durationMin = Math.round(duration / 60);

  const t1Exercise = lastWorkout.sets.find((s) => s.tier === "T1");
  const t2Exercise = lastWorkout.sets.find((s) => s.tier === "T2");

  const t1Name = t1Exercise
    ? EXERCISES[t1Exercise.exerciseId]?.name ?? t1Exercise.exerciseId
    : null;
  const t2Name = t2Exercise
    ? EXERCISES[t2Exercise.exerciseId]?.name ?? t2Exercise.exerciseId
    : null;

  const t1Sets = lastWorkout.sets.filter(
    (s) => s.tier === "T1" && s.status === "completed"
  );
  const t2Sets = lastWorkout.sets.filter(
    (s) => s.tier === "T2" && s.status === "completed"
  );

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">
            Last Workout
          </span>
          <span className="text-xs text-muted-foreground">{timeLabel}</span>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {template.name} &middot; {durationMin} min
          </p>
          {t1Name && (
            <p className="text-sm text-foreground">
              T1: {t1Name}{" "}
              <span className="text-muted-foreground">
                ({t1Sets.length} sets)
              </span>
            </p>
          )}
          {t2Name && (
            <p className="text-sm text-foreground">
              T2: {t2Name}{" "}
              <span className="text-muted-foreground">
                ({t2Sets.length} sets)
              </span>
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
