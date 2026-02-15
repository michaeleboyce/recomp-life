"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import { getDaysSinceLastWorkout, checkInactivity } from "@/lib/inactivity";
import { Card, CardContent } from "@/components/ui/card";

const LEVEL_STYLES: Record<string, string> = {
  gentle: "border-amber-500/30 bg-amber-500/5",
  urgent: "border-orange-500/30 bg-orange-500/5",
  detraining: "border-red-500/30 bg-red-500/5",
};

const LEVEL_TEXT_STYLES: Record<string, string> = {
  gentle: "text-amber-400",
  urgent: "text-orange-400",
  detraining: "text-red-400",
};

export default function InactivityBanner() {
  const lastWorkout = useLiveQuery(async () => {
    const workouts = await db.workouts
      .orderBy("startedAt")
      .reverse()
      .limit(1)
      .toArray();
    const completed = workouts.filter(w => w.completedAt !== null);
    if (completed.length === 0) {
      // Try all completed workouts
      const allWorkouts = await db.workouts.toArray();
      const allCompleted = allWorkouts
        .filter(w => w.completedAt !== null)
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      return allCompleted[0] ?? null;
    }
    return completed[0] ?? null;
  });

  if (lastWorkout === undefined) return null; // Loading

  const now = new Date();
  const lastDate = lastWorkout?.completedAt ? new Date(lastWorkout.completedAt) : null;
  const days = getDaysSinceLastWorkout(lastDate, now);
  const alert = checkInactivity(days);

  if (!alert) return null;

  return (
    <Card className={LEVEL_STYLES[alert.level]}>
      <CardContent className="py-3">
        <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${LEVEL_TEXT_STYLES[alert.level]}`}>
          {alert.level === "gentle" ? "Reminder" : alert.level === "urgent" ? "Heads Up" : "Extended Break"}
        </p>
        <p className="text-sm text-muted-foreground">{alert.message}</p>
        {alert.prescription === "ramp_up_85" && (
          <p className="text-xs text-muted-foreground/70 mt-1">
            Ramp-up protocol: Start at 85% of your last working weights.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
