"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import { calculateRecoveryStatus, getMostRecent } from "@/lib/recovery";
import { EXERCISES } from "@/lib/exercises";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RecoveryStatus, TrainingPhase } from "@/types";

const MAIN_LIFTS = ["squat", "bench", "deadlift", "ohp"] as const;

const STATUS_CONFIG: Record<
  RecoveryStatus,
  { color: string; bgColor: string; label: string; icon: string }
> = {
  recovering: {
    color: "text-red-400",
    bgColor: "bg-red-400",
    label: "Recovering",
    icon: "",
  },
  ready: {
    color: "text-yellow-400",
    bgColor: "bg-yellow-400",
    label: "Ready",
    icon: "",
  },
  primed: {
    color: "text-green-400",
    bgColor: "bg-green-400",
    label: "Primed",
    icon: "\u2605",
  },
  detraining: {
    color: "text-zinc-500",
    bgColor: "bg-zinc-500",
    label: "Detraining",
    icon: "",
  },
};

const STATUS_PROGRESS: Record<RecoveryStatus, number> = {
  recovering: 25,
  ready: 60,
  primed: 90,
  detraining: 15,
};

function formatDaysAgo(lastT1: Date | null, lastT2: Date | null): string {
  const latest = getMostRecent(lastT1, lastT2);
  if (!latest) return "never trained";
  const days = Math.floor(
    (Date.now() - new Date(latest).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export default function RecoveryStatusBars() {
  const liftStates = useLiveQuery(() => db.liftStates.toArray());
  const profile = useLiveQuery(() => db.userProfile.toCollection().first());

  if (!liftStates || liftStates.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recovery Status</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Complete your first workout to see recovery status.
          </p>
        </CardContent>
      </Card>
    );
  }

  const phase: TrainingPhase = profile?.settings?.trainingPhase ?? {
    mode: "maintaining",
  };
  const now = new Date();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Recovery Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {MAIN_LIFTS.map((liftId) => {
          const state = liftStates.find((s) => s.exerciseId === liftId);
          const exercise = EXERCISES[liftId];
          if (!state) return null;

          const t1Date = state.t1LastWorkoutDate
            ? new Date(state.t1LastWorkoutDate)
            : null;
          const t2Date = state.t2LastWorkoutDate
            ? new Date(state.t2LastWorkoutDate)
            : null;

          const status = calculateRecoveryStatus(t1Date, t2Date, now, phase);
          const config = STATUS_CONFIG[status];
          const progress = STATUS_PROGRESS[status];
          const timeLabel = formatDaysAgo(t1Date, t2Date);

          return (
            <div key={liftId} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">
                  {exercise?.name ?? liftId}
                </span>
                <span className={`text-xs ${config.color}`}>
                  {config.icon} {config.label} ({timeLabel})
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${config.bgColor}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
