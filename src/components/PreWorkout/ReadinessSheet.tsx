"use client";

import { useReadinessToday } from "@/hooks";
import { sleepBucket } from "@/lib/health/sleep";
import type { ReadinessAnswers } from "@/lib/readiness";
import type { SleepHours, StressLevel, WorkoutLocation } from "@/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ReadinessSkeleton, ReadinessView } from "@/components/Readiness/ReadinessScreen";

export interface ReadinessSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: WorkoutLocation;
  sleepHours: SleepHours | null;
  stressLevel: StressLevel | null;
  /** Minutes asleep last night from Apple Health, when known. */
  healthSleepMinutes?: number | null;
}

/**
 * The answers as the readiness model reads them, or null until both are given. The
 * Apple Health minutes count only while the sleep answer is still the one they gave,
 * as `start` saves them.
 */
export function answersFrom(
  sleepHours: SleepHours | null,
  stressLevel: StressLevel | null,
  healthSleepMinutes?: number | null
): ReadinessAnswers | null {
  if (!sleepHours || !stressLevel) return null;
  const fromHealth = healthSleepMinutes != null && sleepBucket(healthSleepMinutes) === sleepHours;
  return {
    sleepHours,
    stressLevel,
    ...(fromHealth ? { sleepMinutes: healthSleepMinutes, sleepSource: "apple_health" as const } : {}),
  };
}

/**
 * "See what this changes" on the Ready screen: today's readiness from the answers just
 * given, in a sheet over the screen, so nothing set up here is lost.
 */
export function ReadinessSheet({ open, onOpenChange, ...answers }: ReadinessSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85vh] w-full max-w-lg gap-0 overflow-y-auto rounded-t-2xl"
      >
        <SheetHeader className="pr-12 pb-1">
          <SheetTitle>What your answers change</SheetTitle>
          <SheetDescription>Readiness today, from the answers on this screen.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-8">
          <ReadinessBody {...answers} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Mounted only while the sheet is open, so the records are read only then. */
function ReadinessBody({
  location,
  sleepHours,
  stressLevel,
  healthSleepMinutes,
}: Omit<ReadinessSheetProps, "open" | "onOpenChange">) {
  const score = useReadinessToday({
    location,
    answers: answersFrom(sleepHours, stressLevel, healthSleepMinutes),
  });
  if (score === undefined) return <ReadinessSkeleton />;
  if (score === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Answer both questions, sleep and energy, and the score with everything that moved it
        shows here.
      </p>
    );
  }
  return <ReadinessView score={score} />;
}
