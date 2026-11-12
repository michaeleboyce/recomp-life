"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUnfinishedWorkout } from "@/hooks";
import { discardStaleWorkouts, discardWorkout } from "@/lib/data/workouts";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export default function AbandonedWorkoutBanner() {
  const router = useRouter();
  const session = useUnfinishedWorkout();

  // Unfinished sessions older than 24 hours are no longer offered for resume: remove them.
  useEffect(() => {
    discardStaleWorkouts(TWENTY_FOUR_HOURS_MS).catch((err) =>
      console.error("Failed to clear stale workouts:", err)
    );
  }, []);

  if (!session) return null;

  return (
    <Callout
      variant="warning"
      icon={null}
      actions={
        <>
          <Button
            variant="outline"
            size="xs"
            onClick={() => router.push(`/workout/active?sessionId=${session.id}`)}
          >
            Resume
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => discardWorkout(session.id)}
            className="text-destructive hover:text-destructive"
          >
            Discard
          </Button>
        </>
      }
    >
      <span className="font-medium text-warning">
        {"⚠️"} You have an unfinished workout. Resume or discard?
      </span>
    </Callout>
  );
}
