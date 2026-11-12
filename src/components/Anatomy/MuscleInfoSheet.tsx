"use client";

import Link from "next/link";
import type { MuscleGroupVolume, MuscleId, RecoveryStatus } from "@/types";
import { formatDaysAgo } from "@/lib/dates";
import { exercisesForMuscle } from "@/lib/muscleLoad";
import { MUSCLE_DESCRIPTIONS, formatMuscle, groupOf } from "@/lib/muscles";
import { RECOVERY_COLORS } from "@/lib/anatomy/palette";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface MuscleInfoSheetProps {
  muscle: MuscleId | null;
  onClose: () => void;
  /** This week's volume for the muscle, when known. */
  volume?: MuscleGroupVolume;
  lastTrained?: Date;
  recovery?: RecoveryStatus;
}

const RECOVERY_LABELS: Record<RecoveryStatus, string> = {
  recovering: "Recovering",
  ready: "Ready",
  primed: "Primed",
  detraining: "Detraining",
};

/** Bottom sheet with one muscle's weekly sets, recovery, and exercises. */
export function MuscleInfoSheet({
  muscle,
  onClose,
  volume,
  lastTrained,
  recovery,
}: MuscleInfoSheetProps) {
  const exercises = muscle ? exercisesForMuscle(muscle) : [];
  const direct = volume?.directSets ?? 0;
  const indirect = volume?.indirectSets ?? 0;

  return (
    <Sheet open={muscle !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl">
        {muscle && (
          <>
            <SheetHeader>
              <SheetTitle>{formatMuscle(muscle)}</SheetTitle>
              <SheetDescription>{MUSCLE_DESCRIPTIONS[muscle]}</SheetDescription>
            </SheetHeader>

            <div className="overflow-y-auto px-4 pb-6 space-y-4">
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-muted/50 px-2 py-2.5">
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Sets this week
                  </dt>
                  <dd className="mt-0.5 font-mono text-base font-semibold tabular-nums">
                    {direct}
                    {indirect > 0 && (
                      <span className="text-xs font-normal text-muted-foreground">
                        {" "}
                        +{indirect}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/50 px-2 py-2.5">
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Last trained
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold">
                    {formatDaysAgo(lastTrained, new Date())}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/50 px-2 py-2.5">
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Status
                  </dt>
                  <dd
                    className="mt-0.5 text-sm font-semibold"
                    style={recovery ? { color: RECOVERY_COLORS[recovery] } : undefined}
                  >
                    {recovery ? RECOVERY_LABELS[recovery] : "—"}
                  </dd>
                </div>
              </dl>
              {indirect > 0 && (
                <p className="-mt-2 text-[11px] text-muted-foreground">
                  {direct} direct sets, plus {indirect} where it assists another muscle.
                </p>
              )}

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Exercises ({groupOf(muscle)})
                </h3>
                <ul className="space-y-1">
                  {exercises.map(({ exercise, level }) => (
                    <li key={exercise.id} data-exercise-id={exercise.id}>
                      <Link
                        href={`/exercises/${exercise.id}`}
                        className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 transition-colors hover:bg-muted/70"
                      >
                        <span className="text-sm">{exercise.name}</span>
                        <Badge
                          variant={level === "primary" ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {level === "primary" ? "Primary" : "Secondary"}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
