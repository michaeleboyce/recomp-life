"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function WeekSummary() {
  const weekWorkouts = useLiveQuery(async () => {
    const monday = getMonday(new Date());
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 7);

    return db.workouts
      .where("startedAt")
      .between(monday, sunday)
      .toArray();
  });

  const count = weekWorkouts?.length ?? 0;
  const target = 5;
  const percent = Math.min((count / target) * 100, 100);

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">
            This Week: {count}/{target} workouts
          </span>
          <span className="text-xs text-muted-foreground">
            {percent.toFixed(0)}%
          </span>
        </div>
        <Progress value={percent} className="h-2" />
      </CardContent>
    </Card>
  );
}
