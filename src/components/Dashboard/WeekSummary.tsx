"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import { Card, CardContent } from "@/components/ui/card";
import { calculateConsistencyStreak } from "@/lib/streaks";
import { getMonday } from "@/lib/dates";
import { summariseOtherSessions } from "@/lib/activities";

function WorkoutRing({ count, target }: { count: number; target: number }) {
  const size = 60;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(count / target, 1);
  const offset = circumference * (1 - progress);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="oklch(0.22 0.005 260)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="oklch(0.65 0.10 160)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold text-foreground font-mono tabular-nums">
          {count}/{target}
        </span>
      </div>
    </div>
  );
}

function WeekDots({ completedCount }: { completedCount: number }) {
  const today = new Date().getDay();
  const todayIndex = today === 0 ? 4 : today - 1;

  return (
    <div className="flex gap-1.5 justify-center mt-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`h-2 w-2 rounded-full transition-all ${
            i < completedCount
              ? "bg-foreground"
              : i === todayIndex
                ? "bg-muted-foreground animate-pulse"
                : "bg-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

export default function WeekSummary() {
  const weekWorkouts = useLiveQuery(async () => {
    const monday = getMonday(new Date());
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 7);

    const workouts = await db.workouts
      .where("startedAt")
      .between(monday, sunday)
      .toArray();
    return workouts.filter((w) => w.completedAt !== null);
  });

  // Runs, yoga and other non-lifting sessions this week. Shown for context only:
  // they do not count toward the workout ring or the streak.
  const otherSessions = useLiveQuery(async () => {
    const monday = getMonday(new Date());
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 7);
    const [runs, activities] = await Promise.all([
      db.runs.where("date").between(monday, sunday).toArray(),
      db.activities.where("date").between(monday, sunday).toArray(),
    ]);
    return summariseOtherSessions(runs, activities);
  });

  const allWorkoutDates = useLiveQuery(async () => {
    const workouts = await db.workouts.toArray();
    return workouts
      .filter(w => w.completedAt !== null)
      .map(w => new Date(w.startedAt));
  });

  const count = weekWorkouts?.length ?? 0;
  const target = 5;
  const streak = allWorkoutDates ? calculateConsistencyStreak(allWorkoutDates, new Date()) : 0;

  return (
    <Card>
      <CardContent className="pt-4 flex flex-col items-center">
        <WorkoutRing count={count} target={target} />
        <WeekDots completedCount={count} />
        <p className="text-xs text-muted-foreground mt-2">This Week</p>
        {otherSessions && (
          <p className="text-xs text-muted-foreground mt-1">+ {otherSessions}</p>
        )}
        {streak > 0 && (
          <p className="text-xs font-medium text-foreground mt-1">
            {streak} week streak
          </p>
        )}
      </CardContent>
    </Card>
  );
}
