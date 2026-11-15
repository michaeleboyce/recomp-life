"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Telescope } from "lucide-react";
import { useScoredForecasts } from "@/hooks";
import { summarize } from "@/lib/forecast";
import { BackButton } from "@/components/nav/BackButton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Stripes } from "@/components/ui/stripes";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { ForecastDetailSheet } from "./ForecastDetailSheet";
import { ForecastRow } from "./ForecastRow";
import { MuscleReadySection } from "./MuscleReadyList";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  judgeShare,
  openForecasts,
  TARGET_IN_TEN,
  type ForecastCategory,
  type ForecastView,
} from "./forecastText";

export const EYEBROW = "text-xs font-semibold tracking-[0.16em] uppercase";
export const PILL =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-card px-4 text-[13px] font-bold whitespace-nowrap text-primary outline-none transition-colors hover:bg-card-raised focus-visible:ring-[3px] focus-visible:ring-ring/50";

type Filter = "all" | ForecastCategory;

/**
 * Everything the app is predicting now, read from the forecast ledger: today's
 * session forecasts first, then those for a date weeks ahead. Nothing here is
 * worked out fresh; each row is a stored forecast that has not come due.
 */
export function ForecastsScreen() {
  const scored = useScoredForecasts();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<ForecastView | null>(null);

  const view = useMemo(() => {
    if (!scored) return undefined;
    const now = new Date();
    const open = openForecasts(scored, now);
    const record = summarize(scored);
    return { open, record };
  }, [scored]);

  if (!view) return <SkeletonCard />;

  const { open, record } = view;
  const all = [...open.today, ...open.ahead];
  const categories = CATEGORY_ORDER.filter((c) => all.some((v) => v.category === c));
  const keep = (v: ForecastView) => filter === "all" || v.category === filter;
  const today = open.today.filter(keep);
  const ahead = open.ahead.filter(keep);
  /** Kinds of the forecasts for a date ahead on screen: each gets its rule below the list. */
  const aheadKinds = new Set(ahead.map((v) => v.forecast.kind));
  const share = judgeShare(record.ranges.inside, record.ranges.n, "inside the range");

  return (
    <div className="flex flex-col gap-3">
      <BackButton variant="label" fallback="/progress" label="Progress" className="text-[13px]" />
      <header className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-4xl leading-[0.95] font-extrabold tracking-[0.01em] text-foreground uppercase">
              Forecasts
            </h1>
            <Stripes />
          </div>
          <Link
            href="/progress/forecasts/record"
            className={PILL}
            aria-label={
              share.enough
                ? `Track record: ${share.value} of results inside the range`
                : "Track record"
            }
          >
            {share.enough ? `${share.value} on target` : "Track record"}
          </Link>
        </div>
        <p className="text-[13px] leading-snug text-muted-foreground">
          Everything the app is predicting right now. Each range is built to hold the result{" "}
          {TARGET_IN_TEN}. Tap one for the working.
        </p>
        {categories.length > 1 && (
          <SegmentedControl<Filter>
            value={filter}
            onChange={setFilter}
            size="compact"
            options={[
              { value: "all", label: `All ${all.length}` },
              ...categories.map((c) => ({ value: c as Filter, label: CATEGORY_LABELS[c] })),
            ]}
          />
        )}
      </header>

      {all.length === 0 ? (
        <EmptyState
          icon={<Telescope />}
          title={record.total === 0 ? "No forecasts yet" : "Nothing open right now"}
          body={
            record.total === 0
              ? "They start with your next workout: before the first set the app writes down what it expects, and checks it afterwards."
              : "Every stored forecast has been checked. The next ones are written when you start a workout."
          }
          action={
            <Button asChild>
              <Link href="/">Go to Today</Link>
            </Button>
          }
        />
      ) : (
        <>
          {today.length > 0 && (
            <section aria-labelledby="forecasts-today" className="flex flex-col">
              <h2 id="forecasts-today" className={`${EYEBROW} pt-2 pb-1 text-primary`}>
                Today&apos;s workout
              </h2>
              {today.map((v) => (
                <ForecastRow key={v.id} view={v} onOpen={setSelected} />
              ))}
            </section>
          )}
          {ahead.length > 0 && (
            <section aria-labelledby="forecasts-ahead" className="flex flex-col">
              <h2 id="forecasts-ahead" className={`${EYEBROW} pt-2 pb-1 text-muted-foreground`}>
                Weeks ahead
              </h2>
              {ahead.map((v) => (
                <ForecastRow key={v.id} view={v} onOpen={setSelected} />
              ))}
            </section>
          )}
          {today.length === 0 && ahead.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing open in this group.
            </p>
          )}
        </>
      )}

      {filter === "all" && <MuscleReadySection />}

      {aheadKinds.size > 0 && (
        <section aria-labelledby="forecasts-rules" className="flex flex-col gap-1.5">
          <h2 id="forecasts-rules" className={`${EYEBROW} pt-2 text-muted-foreground`}>
            How the weeks ahead are worked out
          </h2>
          {aheadKinds.has("stallRisk") && <EvidenceLine ruleId="forecast-stall" />}
          {aheadKinds.has("milestone") && <EvidenceLine ruleId="forecast-milestone" />}
          {aheadKinds.has("bodyweight4w") && <EvidenceLine ruleId="forecast-bodyweight" />}
        </section>
      )}

      <ForecastDetailSheet
        view={selected}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSelected(null);
        }}
      />
    </div>
  );
}
