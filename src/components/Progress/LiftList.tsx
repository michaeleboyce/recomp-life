"use client";

import { Sparkline } from "@/components/chart-kit";
import { Delta } from "@/components/ui/delta";
import Link from "next/link";
import { ExerciseImage } from "@/components/ui/exercise-image";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/ui/section-header";
import { formatStage } from "./lifts";
import type { LiftOverview } from "./strength";

/** One accent band colour per lift, from the stripe and chart tokens. */
const LIFT_ACCENT: Record<string, string> = {
  squat: "bg-stripe-3",
  bench: "bg-stripe-2",
  deadlift: "bg-stripe-1",
  ohp: "bg-chart-4",
};

/** "Aug 2", or "Aug 2, 2025" when it is not this year. */
function pointDay(t: number): string {
  const date = new Date(t);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

function LiftCard({ lift }: { lift: LiftOverview }) {
  const { liftState, summary, stall, estimate } = lift;
  // The pooled estimate the lift page shows, with its line's change and the line itself.
  // Without one, the range's latest estimate, else the latest before it.
  const latest = summary.latest ?? lift.latestBeforeRange;
  const value = estimate ? estimate.value : latest?.v;
  const imported = estimate ? estimate.latest?.imported === true : latest?.imported === true;
  // No session in the range: when the newest one was.
  const olderThanRange = !summary.latest ? (estimate?.latest?.t ?? lift.latestBeforeRange?.t ?? null) : null;
  const sparkPoints = estimate ? estimate.line : lift.series.points;
  const delta = estimate ? (
    estimate.change !== null ? (
      <Delta value={Math.round(estimate.change)} better="up" className={stall ? "text-warning" : undefined} />
    ) : undefined
  ) : stall ? (
    <Delta
      value={Math.round(stall.change)}
      suffix={`in ${stall.weeks} wk`}
      better="up"
      format={(abs) => (abs === 0 ? "+0" : String(abs))}
      className="text-warning"
    />
  ) : summary.change !== null ? (
    <Delta value={Math.round(summary.change)} better="up" />
  ) : undefined;

  return (
    <Link
      href={`/progress/lift/${lift.id}`}
      data-slot="lift-card"
      className="relative flex min-h-[116px] items-stretch gap-3 overflow-hidden rounded-3xl bg-card py-3.5 pr-3.5 pl-5 text-card-foreground transition-colors outline-none hover:bg-card-raised focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-2",
          LIFT_ACCENT[lift.id] ?? "bg-stripe-2",
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col justify-between gap-1">
        <span className="font-display text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {lift.label}
          {liftState && (
            <>
              {" · "}working {liftState.t1Weight}
              <span className="sr-only">
                , {formatStage(liftState.t1Stage)}
              </span>
            </>
          )}
        </span>
        <span className="flex items-baseline gap-2">
          <span className="font-display text-[44px] leading-none font-bold tabular-nums text-foreground">
            {value !== undefined ? Math.round(value) : "–"}
          </span>
          {imported && (
            <span data-testid="lift-latest-imported" className="text-xs font-semibold text-muted-foreground">
              Imported
            </span>
          )}
          {/* Older than the range: the estimate the total counts, with when it was. */}
          {olderThanRange !== null && (
            <span data-testid="lift-latest-date" className="text-xs text-muted-foreground">
              {pointDay(olderThanRange)}
            </span>
          )}
          {delta}
        </span>
        {sparkPoints.length > 0 && (
          <Sparkline
            points={sparkPoints}
            width={96}
            height={24}
            tone={stall ? "warn" : "good"}
          />
        )}
      </span>
      <ExerciseImage
        exerciseId={lift.id}
        variant="arch"
        className="self-center"
      />
    </Link>
  );
}

/** One card per main lift, linking to its detail page. */
export function LiftList({ lifts }: { lifts: LiftOverview[] }) {
  return (
    <section aria-label="Lifts">
      <SectionHeader title="Lifts" className="mb-2" />
      <div data-testid="lift-list" className="flex flex-col gap-2.5">
        {lifts.map((lift) => (
          <LiftCard key={lift.id} lift={lift} />
        ))}
      </div>
    </section>
  );
}
