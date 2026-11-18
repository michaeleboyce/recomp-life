"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useCompletedWorkouts, useSettings, useTrainingLocation, useUpcomingWorkoutDetail } from "@/hooks";
import { leftOutNote } from "@/lib/accessories/sessionBudget";
import type { RuleId } from "@/lib/evidence";
import { upcomingListHref } from "@/lib/routes";
import { tierStyle } from "@/lib/tierStyle";
import { cn } from "@/lib/utils";
import type { UpcomingLift, UpcomingWorkoutDetail } from "@/lib/workout/upcoming";
import type { WorkoutLocation, WorkoutSession } from "@/types";
import { BackButton } from "@/components/nav/BackButton";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { LocationChip } from "@/components/ui/location-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { Stripes } from "@/components/ui/stripes";
import { WorkoutFigure } from "@/components/ui/workout-figure";
import { AccessoryRows, CHANGE_ACCESSORIES_HREF } from "@/components/Today/AccessoryRows";
import { accessoryRowViews } from "@/components/Today/accessoryRowModel";
import { LiftRows } from "@/components/Today/LiftRows";
import { EYEBROW } from "@/components/Today/TodayHero";
import { dayName, displayLiftName } from "@/components/Today/todayModel";
import { LiveWhySheet, ProjectionSheet, ProjectionWhyButton } from "./ProjectionSheet";
import { upcomingMinutes } from "./sessionMinutes";
import {
  assumptionLine,
  lengthLine,
  positionLabel,
  setBlocks,
  setText,
  startAction,
  upcomingLiftRows,
  whatWouldChange,
  type SetBlock,
} from "./upcomingView";

const PROGRESSION_RULE: RuleId = "gzclp-progression";

/** The look of Today's START. */
const MAIN_BUTTON =
  "flex h-[58px] shrink-0 items-center justify-center rounded-full bg-primary font-display text-[19px] leading-none font-extrabold tracking-[0.14em] text-primary-foreground uppercase outline-none transition-transform focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.99]";

const SECTION = "font-display text-[12px] font-semibold tracking-[0.16em] text-muted-foreground uppercase";

/**
 * One coming workout in full (W1 to W5): the day, its length against the target and the
 * muscles it works; the main button; each lift with its reason and why; the accessories;
 * every set in order; what would change it.
 */
export function UpcomingWorkoutView({
  position,
  location: asked,
  from,
}: {
  position: number;
  /** From the address; null uses the saved default. */
  location: WorkoutLocation | null;
  from: "today" | null;
}) {
  const { location: saved, isLoading } = useTrainingLocation();
  const location = asked ?? saved;
  const detail = useUpcomingWorkoutDetail(location, position);
  const finished = useCompletedWorkouts();
  const settings = useSettings();
  const [now] = useState(() => new Date());
  const back = (
    <BackButton
      variant="label"
      fallback={from === "today" ? "/" : upcomingListHref(location)}
      label={from === "today" ? "Today" : "Coming up"}
      className="text-accent-primary"
    />
  );

  if ((asked === null && isLoading) || detail === undefined || finished === undefined || settings === undefined) {
    return (
      <Shell>
        {back}
        <div data-testid="upcoming-detail-loading" aria-busy="true" className="flex flex-col gap-2.5">
          <Skeleton className="h-[150px] rounded-[18px]" />
          <Skeleton className="h-[58px] rounded-full" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      </Shell>
    );
  }

  if (detail === null) {
    return (
      <Shell>
        {back}
        <p className="px-1 text-sm text-muted-foreground">This workout is not in the plan.</p>
      </Shell>
    );
  }

  const minutes = upcomingMinutes(detail.plan, finished, settings?.trainingPhase, now);
  return (
    <Shell>
      {back}
      <DetailBody
        detail={detail}
        minutes={minutes}
        finished={finished}
        liveWhy={!detail.projected && !isLoading && location === saved}
        from={from}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-slot="page-shell"
      className="mx-auto flex max-w-lg flex-col gap-2.5 px-4 pt-[calc(4px+env(safe-area-inset-top))] pb-6"
    >
      {children}
    </div>
  );
}

function DetailBody({
  detail,
  minutes,
  finished,
  liveWhy,
  from,
}: {
  detail: UpcomingWorkoutDetail;
  minutes: number | null;
  finished: WorkoutSession[];
  /** The next workout at the saved location: Today's why sheet explains it. */
  liveWhy: boolean;
  from: "today" | null;
}) {
  const [open, setOpen] = useState<UpcomingLift | null>(null);
  const { template, templateId, position, location } = detail;
  const name = dayName(template.exercises.find((e) => e.tier === "T1")?.exerciseId, template.name);
  const figureIds = detail.lifts.map((l) => l.entry.substituteExerciseId ?? l.entry.exerciseId);
  const budget = detail.accessories?.budget ?? null;
  const length = lengthLine(minutes, budget?.minutes);
  const action = startAction(detail);

  const rows = useMemo(() => {
    const base = upcomingLiftRows(detail, finished);
    if (liveWhy) return base;
    return base.map((row, i) => ({
      ...row,
      why: <ProjectionWhyButton liftName={row.name} onOpen={() => setOpen(detail.lifts[i])} />,
    }));
  }, [detail, finished, liveWhy]);
  const accessories = useMemo(() => accessoryRowViews(detail.plan, detail.accessories), [detail]);
  const blocks = useMemo(() => setBlocks(detail.plan), [detail]);
  const liftFor = (block: SetBlock) =>
    detail.lifts.find((l) => l.entry.exerciseId === block.exerciseId && l.entry.tier === block.tier);

  return (
    <>
      <header
        aria-labelledby="upcoming-detail-title"
        className="flex items-end justify-between gap-2.5 rounded-[18px] bg-card px-4 pt-3 pb-3"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className={cn(EYEBROW, detail.projected ? "text-muted-foreground" : "text-accent-primary")}>
              {positionLabel(position, templateId)}
            </span>
            <LocationChip location={location} size="sm" />
          </div>
          <h1
            id="upcoming-detail-title"
            className="font-display text-[40px] leading-[0.95] font-extrabold tracking-[0.01em] text-foreground uppercase"
          >
            {name}
          </h1>
          <Stripes />
          {length && (
            <p data-testid="upcoming-length" className="flex items-center gap-1 text-[13px] font-semibold text-foreground">
              {length}
              {budget?.minutes != null && <EvidenceLine ruleId="session-length-budget" variant="icon" />}
            </p>
          )}
        </div>
        <span aria-hidden="true" className="shrink-0 rounded-2xl bg-background/85 px-2 pt-2 pb-1.5">
          <WorkoutFigure exerciseIds={figureIds} className="h-[112px]" />
        </span>
      </header>

      <div className="flex flex-col gap-1">
        <Link href={action.href} className={MAIN_BUTTON}>
          {action.label}
        </Link>
        {action.note && (
          <p data-testid="start-note" className="pt-1 text-center text-[13px] text-muted-foreground">
            {action.note}
          </p>
        )}
      </div>

      <section aria-labelledby="upcoming-lifts" className="-mx-4">
        <h2 id="upcoming-lifts" className={cn(SECTION, "px-5 pt-2")}>
          Lifts
        </h2>
        <LiftRows rows={rows} />
        {liveWhy ? null : detail.projected ? (
          <ProjectionSheet lift={open} onClose={() => setOpen(null)} />
        ) : (
          <LiveWhySheet lift={open} location={location} onClose={() => setOpen(null)} />
        )}
      </section>

      <section aria-label="Accessories" className="flex flex-col gap-1">
        {detail.projected && accessories.length > 0 && (
          <p data-testid="accessories-likely" className="px-1 text-xs text-muted-foreground">
            <b className="font-semibold text-foreground">Likely.</b> Chosen on the day from what you have
            trained by then.
          </p>
        )}
        <AccessoryRows
          views={accessories}
          why={liveWhy}
          changeHref={detail.projected ? undefined : CHANGE_ACCESSORIES_HREF}
          timeNote={leftOutNote(budget)}
          className="px-1"
        />
      </section>

      <section aria-labelledby="upcoming-sets" className="flex flex-col gap-1">
        <h2 id="upcoming-sets" className={cn(SECTION, "px-1 pt-2")}>
          Set by set
        </h2>
        <ol aria-label="Every set in order" className="flex flex-col">
          {blocks.map((block) => (
            <SetBlockRow
              key={block.key}
              block={block}
              note={(() => {
                const lift = liftFor(block);
                return lift ? assumptionLine(lift, position) : null;
              })()}
              likely={detail.projected && block.tier === "accessory"}
            />
          ))}
        </ol>
      </section>

      <section aria-labelledby="upcoming-changes" className="flex flex-col gap-1">
        <h2 id="upcoming-changes" className={cn(SECTION, "px-1 pt-2")}>
          What would change this
        </h2>
        <ul className="flex flex-col">
          {whatWouldChange(detail, from).map((item) =>
            item.href ? (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="flex min-h-11 items-center gap-2 border-t border-border px-1 text-[13px] text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span className="min-w-0 flex-1">{item.text}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ) : (
              <li key={item.key} className="flex min-h-11 items-center border-t border-border px-1 text-[13px] text-foreground">
                {item.text}
              </li>
            )
          )}
        </ul>
        <div className="px-1 pt-1">
          <EvidenceLine ruleId={PROGRESSION_RULE} />
        </div>
      </section>
    </>
  );
}

function SetBlockRow({ block, note, likely }: { block: SetBlock; note: string | null; likely: boolean }) {
  const style = tierStyle(block.tier);
  return (
    <li data-testid="set-block" className="flex flex-col gap-1 border-t border-border px-1 py-2.5">
      <span className="flex items-baseline gap-2">
        <span className={cn("w-5 shrink-0 font-mono text-[12px] font-medium", style.text)}>
          {block.tier === "accessory" ? "+" : style.label}
        </span>
        <span className="min-w-0 truncate text-[15px] font-bold text-foreground">{displayLiftName(block.shownId)}</span>
        {likely && <span className="text-xs text-muted-foreground">likely</span>}
        {block.perHand && <span className="ml-auto shrink-0 text-xs text-muted-foreground">lb per hand</span>}
      </span>
      {block.warmUps.length > 0 && <SetLine label="Warm-up" sets={block.warmUps} testId="warm-up-sets" />}
      <SetLine label="Sets" sets={block.sets} amrap={block.isAMRAP} testId="working-sets" />
      {note && (
        <p data-testid="assumption" className="pl-7 text-xs text-muted-foreground">
          {note}
        </p>
      )}
    </li>
  );
}

function SetLine({
  label,
  sets,
  amrap = false,
  testId,
}: {
  label: string;
  sets: SetBlock["sets"];
  amrap?: boolean;
  testId: string;
}) {
  return (
    <span className="flex items-baseline gap-2 pl-7">
      <span className="w-14 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span data-testid={testId} className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 font-mono text-[13px] text-foreground tabular-nums">
        {sets.map((set, i) => (
          <span key={i}>{setText(set, i === sets.length - 1, amrap)}</span>
        ))}
      </span>
    </span>
  );
}
