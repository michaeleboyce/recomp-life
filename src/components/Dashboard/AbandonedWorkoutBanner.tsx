"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
// No hook lists stale unfinished sessions, so the clean-up below reads them directly.
// This file therefore stays on DB_IMPORT_ALLOWLIST.
import { db } from "@/db/local";
import { useUnfinishedWorkout } from "@/hooks";
import { discardWorkout } from "@/lib/data/workouts";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export default function AbandonedWorkoutBanner() {
  const router = useRouter();
  const session = useUnfinishedWorkout();

  const staleIds = useLiveQuery(async () => {
    const all = await db.workouts.toArray();
    const now = Date.now();
    return all
      .filter(
        (w) =>
          w.completedAt === null &&
          now - new Date(w.startedAt).getTime() >= TWENTY_FOUR_HOURS_MS
      )
      .map((w) => w.id);
  });

  // Auto-delete sessions older than 24 hours
  useEffect(() => {
    if (!staleIds || staleIds.length === 0) return;
    Promise.all(staleIds.map((id) => discardWorkout(id)));
  }, [staleIds]);

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
