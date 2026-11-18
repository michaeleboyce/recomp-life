"use client";

import Link from "next/link";
import { Activity, ChevronRight, Dumbbell, HeartPulse, Scale, Star } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useBodyweightLog, useDueTemplateId, useFavoriteWorkouts, useRuns } from "@/hooks";
import { cn } from "@/lib/utils";
import { workoutDisplayName } from "@/lib/workoutNames";
import { withFrom, type FromKey } from "./backTarget";

interface QuickAddSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the sheet was opened, so the logging screens can send the user back there. */
  from?: FromKey | null;
}

const rowClass =
  "flex min-h-[44px] items-center gap-3.5 py-3.5 px-1 text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-lg";

function SecondaryMono({ children }: { children?: string }) {
  if (!children) return null;
  return <span className="font-mono text-[13px] font-medium text-muted-foreground">{children}</span>;
}

export function QuickAddSheet({ open, onOpenChange, from }: QuickAddSheetProps) {
  const dueTemplateId = useDueTemplateId();
  const bodyweight = useBodyweightLog();
  const runs = useRuns();
  const favorites = useFavoriteWorkouts();

  const nextSubtitle = dueTemplateId ? workoutDisplayName(dueTemplateId, true) : undefined;

  const lastWeight = bodyweight && bodyweight.length > 0 ? bodyweight[bodyweight.length - 1].weight : null;
  const lastRunMiles = runs?.[0]?.distanceMiles ?? null;

  const favoritesSubtitle =
    favorites === undefined
      ? undefined
      : favorites.length === 0
        ? "None saved yet"
        : `${favorites.length} saved`;

  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn(
          // pt-11 keeps the first row clear of the sheet's grab handle (44px tall).
          "mx-auto max-w-lg gap-1.5 rounded-t-3xl border-t-0 bg-card px-5 pt-11",
          "pb-[calc(env(safe-area-inset-bottom)+20px)]"
        )}
      >
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

        <Link href="/favorites" onClick={close} className={cn(rowClass, "border-b border-border")}>
          <Star className="size-5 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 text-base font-semibold">Start a favourite</span>
          <SecondaryMono>{favoritesSubtitle}</SecondaryMono>
        </Link>

        <Link href={withFrom("/weigh-in", from)} onClick={close} className={cn(rowClass, "border-b border-border")}>
          <Scale className="size-5 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 text-base font-semibold">Log weight</span>
          <SecondaryMono>{lastWeight !== null ? `last ${lastWeight.toFixed(1)}` : undefined}</SecondaryMono>
        </Link>

        <Link href={withFrom("/activity", from)} onClick={close} className={cn(rowClass, "border-b border-border")}>
          <Activity className="size-5 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 text-base font-semibold">Log activity</span>
          <SecondaryMono>{lastRunMiles !== null ? `last ${lastRunMiles.toFixed(1)} mi` : undefined}</SecondaryMono>
        </Link>

        <Link href={withFrom("/body-check", from)} onClick={close} className={rowClass}>
          <HeartPulse className="size-5 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 text-base font-semibold">Body check</span>
          <span className="text-[13px] text-muted-foreground">pain or soreness</span>
        </Link>
      </SheetContent>
    </Sheet>
  );
}
