"use client";

import Link from "next/link";
import { Activity, ChevronRight, Dumbbell, HeartPulse, Scale } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useBodyweightLog, useNextWorkout, useRuns } from "@/hooks";
import { getExercise } from "@/lib/exercises";
import { cn } from "@/lib/utils";

interface QuickAddSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const rowClass =
  "flex min-h-[44px] items-center gap-3.5 py-3.5 px-1 text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-lg";

function SecondaryMono({ children }: { children?: string }) {
  if (!children) return null;
  return <span className="font-mono text-[13px] font-medium text-muted-foreground">{children}</span>;
}

export function QuickAddSheet({ open, onOpenChange }: QuickAddSheetProps) {
  const next = useNextWorkout();
  const bodyweight = useBodyweightLog();
  const runs = useRuns();

  const t1 = next?.template.exercises.find((e) => e.tier === "T1");
  const nextSubtitle = next
    ? [next.templateId, t1 ? getExercise(t1.exerciseId).name : null].filter(Boolean).join(" · ")
    : undefined;

  const lastWeight = bodyweight && bodyweight.length > 0 ? bodyweight[bodyweight.length - 1].weight : null;
  const lastRunMiles = runs?.[0]?.distanceMiles ?? null;

  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn(
          "mx-auto max-w-lg gap-1.5 rounded-t-3xl border-t-0 bg-card px-5 pt-2.5",
          "pb-[calc(env(safe-area-inset-bottom)+20px)]"
        )}
      >
        <div aria-hidden="true" className="mb-2 h-1 w-10 self-center rounded-full bg-border" />
        <SheetTitle className="sr-only">Quick add</SheetTitle>
        <SheetDescription className="sr-only">Start a workout or log something.</SheetDescription>

        <Link
          href="/workout/configure"
          onClick={close}
          className="flex min-h-[44px] items-center gap-3.5 rounded-2xl bg-primary p-4 text-primary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Dumbbell className="size-5" aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="text-base font-extrabold">Start workout</span>
            {nextSubtitle && <span className="truncate text-[13px] font-medium">{nextSubtitle}</span>}
          </span>
          <ChevronRight className="size-5" aria-hidden="true" />
        </Link>

        <Link href="/weigh-in" onClick={close} className={cn(rowClass, "border-b border-border")}>
          <Scale className="size-5 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 text-base font-semibold">Log weight</span>
          <SecondaryMono>{lastWeight !== null ? `last ${lastWeight.toFixed(1)}` : undefined}</SecondaryMono>
        </Link>

        <Link href="/run" onClick={close} className={cn(rowClass, "border-b border-border")}>
          <Activity className="size-5 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 text-base font-semibold">Log run</span>
          <SecondaryMono>{lastRunMiles !== null ? `last ${lastRunMiles.toFixed(1)} mi` : undefined}</SecondaryMono>
        </Link>

        <Link href="/body-check" onClick={close} className={rowClass}>
          <HeartPulse className="size-5 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 text-base font-semibold">Body check</span>
          <span className="text-[13px] text-muted-foreground">pain or soreness</span>
        </Link>
      </SheetContent>
    </Sheet>
  );
}
