"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { db } from "@/db/local";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { WorkoutSession } from "@/types";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export default function AbandonedWorkoutBanner() {
  const router = useRouter();

  const incompleteWorkouts = useLiveQuery(async () => {
    const allWorkouts = await db.workouts.toArray();
    return allWorkouts.filter((w) => w.completedAt === null);
  });

  // Auto-delete sessions older than 24 hours
  useEffect(() => {
    if (!incompleteWorkouts || incompleteWorkouts.length === 0) return;

    const now = Date.now();
    const stale = incompleteWorkouts.filter(
      (w) => now - new Date(w.startedAt).getTime() >= TWENTY_FOUR_HOURS_MS
    );

    if (stale.length > 0) {
      Promise.all(stale.map((w) => db.workouts.delete(w.id)));
    }
  }, [incompleteWorkouts]);

  if (!incompleteWorkouts || incompleteWorkouts.length === 0) return null;

  const now = Date.now();
  const recentSessions = incompleteWorkouts.filter(
    (w) => now - new Date(w.startedAt).getTime() < TWENTY_FOUR_HOURS_MS
  );

  if (recentSessions.length === 0) return null;

  const handleResume = (session: WorkoutSession) => {
    router.push(`/workout/active?sessionId=${session.id}`);
  };

  const handleDiscard = async (session: WorkoutSession) => {
    await db.workouts.delete(session.id);
  };

  return (
    <div className="space-y-2">
      {recentSessions.map((session) => (
        <div
          key={session.id}
          className="rounded-lg px-4 py-3 bg-yellow-500/20 border border-yellow-500/30"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-300">
                {"\u26A0\uFE0F"} You have an unfinished workout. Resume or
                discard?
              </p>
            </div>
            <div className="flex gap-2 ml-2">
              <Button
                variant="outline"
                size="xs"
                onClick={() => handleResume(session)}
              >
                Resume
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleDiscard(session)}
                className="text-red-400 hover:text-red-300"
              >
                Discard
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
