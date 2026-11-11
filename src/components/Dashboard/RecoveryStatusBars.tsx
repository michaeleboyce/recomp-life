"use client";

import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import { calculateRecoveryStatus, getMostRecent } from "@/lib/recovery";
import { EXERCISES } from "@/lib/exercises";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { Footprints, Grip, ArrowUpFromLine, CircleDot } from "lucide-react";
import type { RecoveryStatus, TrainingPhase } from "@/types";

const MAIN_LIFTS = ["squat", "bench", "deadlift", "ohp"] as const;

const LIFT_ICONS: Record<string, React.ElementType> = {
  squat: Footprints,
  bench: Grip,
  deadlift: ArrowUpFromLine,
  ohp: CircleDot,
};

const STATUS_CONFIG: Record<
  RecoveryStatus,
  { color: string; label: string; icon: string }
> = {
  recovering: { color: "text-red-400", label: "Recovering", icon: "" },
  ready: { color: "text-yellow-400", label: "Ready", icon: "" },
  primed: { color: "text-green-400", label: "Primed", icon: "\u2605" },
  detraining: { color: "text-zinc-500", label: "Long break", icon: "" },
};

const STATUS_GRADIENT: Record<RecoveryStatus, string> = {
  recovering: "linear-gradient(90deg, oklch(0.65 0.18 55), oklch(0.55 0.15 45))",
  ready: "linear-gradient(90deg, oklch(0.7 0.16 85), oklch(0.65 0.14 95))",
  primed: "linear-gradient(90deg, oklch(0.65 0.17 155), oklch(0.6 0.15 145))",
  detraining: "linear-gradient(90deg, oklch(0.45 0.02 260), oklch(0.4 0.03 250))",
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
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

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
        <CardTitle className="flex items-center gap-1.5 text-base">
          Recovery Status
          <EvidenceLine ruleId="recovery-windows" variant="icon" />
        </CardTitle>
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
          const LiftIcon = LIFT_ICONS[liftId];

          return (
            <div key={liftId} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5">
                  {LiftIcon && <LiftIcon className="h-4 w-4 text-muted-foreground" />}
                  <span className="font-medium text-foreground">
                    {exercise?.name ?? liftId}
                  </span>
                </div>
                <span className={`text-xs font-mono tabular-nums ${config.color}`}>
                  {config.icon} {config.label} ({timeLabel})
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: animated ? `${progress}%` : "0%",
                    background: STATUS_GRADIENT[status],
                  }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
