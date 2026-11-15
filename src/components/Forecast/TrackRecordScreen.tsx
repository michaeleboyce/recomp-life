"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/nav/BackButton";
import { useScoredForecasts } from "@/hooks";
import { trackRecord } from "@/lib/forecast";
import { CalibrationChart, calibrationSummary } from "@/components/chart-kit";
import { Button } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { SkeletonCard } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EYEBROW } from "./ForecastsScreen";
import {
  BASIS_LABELS,
  BASIS_ORDER,
  chartBins,
  formatAmount,
  inPeriod,
  judgeShare,
  kindRows,
  MIN_RESULTS_TO_JUDGE,
  PERIOD_LABELS,
  TARGET_PERCENT,
  TOO_FEW_TO_JUDGE,
  voidLine,
  widenedKinds,
  wrongest,
  type Period,
} from "./forecastText";

const ROW = "grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border py-2 first:border-t-0";
const ROW_VALUE = "font-display text-xl leading-none font-extrabold whitespace-nowrap text-right tabular-nums";

/** A value, or the words that stand in for one while there are too few results. */
function Value({ value }: { value: string | null }) {
  if (value !== null) return <span className={ROW_VALUE}>{value}</span>;
  return <span className="max-w-[9rem] text-right text-xs text-muted-foreground">{TOO_FEW_TO_JUDGE}</span>;
}

/** How the record fills in, for a user with no checked forecasts yet. */
function FirstRun({ open }: { open: number }) {
  return (
    <section className="flex flex-col gap-3 rounded-[20px] bg-card p-4" aria-labelledby="record-first-run">
      <h2 id="record-first-run" className={`${EYEBROW} text-primary`}>
        How the record builds up
      </h2>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-foreground">
        <li>When you start a workout, before the first set, the app writes down what it expects: reps on each last set, the chance of a pass or a new best, how long the session takes.</li>
        <li>Every week it also writes down where each lift&apos;s estimated max and your bodyweight should be four weeks on.</li>
        <li>When the result is in, each forecast is checked against your log. Nothing it wrote down is changed afterwards.</li>
        <li>Once a kind has about {MIN_RESULTS_TO_JUDGE} results, this page shows how often it was right.</li>
      </ol>
      <p className="text-[13px] text-muted-foreground">
        {open === 0
          ? "No forecasts are waiting yet."
          : `${open} ${open === 1 ? "forecast is" : "forecasts are"} waiting for a result.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary">
          <Link href="/progress/forecasts">See forecasts</Link>
        </Button>
        <Button asChild>
          <Link href="/">Go to Today</Link>
        </Button>
      </div>
    </section>
  );
}

/**
 * How right the stored forecasts have been: the share of results inside their range,
 * stated chances against how often they happened, each kind's own measure, where the
 * app has leaned one way, and the split by how much history a forecast had. Void
 * forecasts are counted apart and never as misses.
 */
export function TrackRecordScreen() {
  const scored = useScoredForecasts();
  const [period, setPeriod] = useState<Period>("all");

  const data = useMemo(() => {
    if (!scored) return undefined;
    const now = new Date();
    const everResolved = scored.some((s) => s.status.state === "resolved");
    const open = scored.filter((s) => s.status.state === "open").length;
    const rows = inPeriod(scored, period, now);
    return {
      everResolved,
      open,
      rows,
      split: trackRecord(rows),
      kinds: kindRows(rows),
      wrong: wrongest(rows),
      widened: widenedKinds(scored),
      voids: voidLine(rows),
    };
  }, [scored, period]);

  const top = (
    <div className="flex items-center justify-between gap-2">
      <BackButton variant="label" fallback="/progress/forecasts" label="Forecasts" className="text-[13px]" />
      {data?.everResolved && (
        <ChipGroup
          size="sm"
          ariaLabel="Period"
          value={period}
          onChange={(v) => setPeriod(v as Period)}
          options={(Object.keys(PERIOD_LABELS) as Period[]).map((p) => ({
            value: p,
            label: PERIOD_LABELS[p],
          }))}
          className="flex-nowrap gap-1.5"
        />
      )}
    </div>
  );

  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        {top}
        <SkeletonCard />
      </div>
    );
  }

  if (!data.everResolved) {
    return (
      <div className="flex flex-col gap-4">
        {top}
        <h1 className="font-display text-4xl leading-[0.95] font-extrabold text-foreground uppercase">
          Track record
        </h1>
        <FirstRun open={data.open} />
      </div>
    );
  }

  const { overall, byBasis } = data.split;
  const headline = judgeShare(overall.ranges.inside, overall.ranges.n, "results");
  const bins = chartBins(overall);
  const fewChances = overall.chances.n < MIN_RESULTS_TO_JUDGE;
  const periodWords = period === "all" ? "so far" : `in the last ${PERIOD_LABELS[period]}`;

  return (
    <div className="flex flex-col gap-4">
      {top}
      <h1 className="sr-only">Track record</h1>

      <section aria-labelledby="record-headline" className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-3.5">
        <span
          data-slot="record-headline"
          className={cn(
            "font-display leading-[0.88] font-extrabold text-foreground tabular-nums",
            headline.enough ? "text-[84px]" : "text-5xl"
          )}
        >
          {headline.enough ? (
            <>
              {headline.value!.replace("%", "")}
              <span className="text-4xl">%</span>
            </>
          ) : (
            `${overall.ranges.inside}/${overall.ranges.n}`
          )}
        </span>
        <div className="flex flex-col gap-1.5 pb-1">
          <h2 id="record-headline" className={`${EYEBROW} text-primary`}>
            How right has it been?
          </h2>
          <p className="text-[13px] leading-snug text-foreground">
            {overall.ranges.n === 0
              ? `No forecast with a range came due ${periodWords}.`
              : `${overall.ranges.inside} of ${overall.ranges.n} results ${periodWords} landed inside the forecast range.`}{" "}
            The range is built to catch {TARGET_PERCENT}%.
            {!headline.enough && overall.ranges.n > 0 && ` That is ${TOO_FEW_TO_JUDGE}.`}
          </p>
        </div>
      </section>

      <section aria-labelledby="record-calibration" className="flex flex-col gap-2 rounded-[20px] bg-card px-3 pt-3 pb-3">
        <h2 id="record-calibration" className={`${EYEBROW} text-muted-foreground`}>
          When it said X%, how often it happened
        </h2>
        {bins.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No stated chance has come due {periodWords}. Chances of a pass and of a new best
            are checked when a workout ends.
          </p>
        ) : (
          <>
            {fewChances && (
              <p className="rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs text-foreground">
                Only {overall.chances.n} {overall.chances.n === 1 ? "result" : "results"} so far: {TOO_FEW_TO_JUDGE}. Read
                the dots as a start, not a verdict.
              </p>
            )}
            <CalibrationChart bins={bins} className="w-full" />
            <p className="text-xs leading-snug text-muted-foreground">
              On the dashed line means honest odds. Bigger dots mean more forecasts.
            </p>
            <p data-slot="calibration-summary" className="text-xs leading-snug text-muted-foreground">
              {calibrationSummary(bins)}
            </p>
          </>
        )}
      </section>

      {data.kinds.length > 0 && (
        <section aria-labelledby="record-kinds" className="flex flex-col">
          <h2 id="record-kinds" className="sr-only">
            By kind of forecast
          </h2>
          {data.kinds.map((row) => (
            <div key={row.id} className={ROW} data-kind={row.id}>
              <span className="min-w-0">
                <b className="block text-sm font-semibold text-foreground">{row.title}</b>
                <small className="block text-xs text-muted-foreground">{row.subtitle}</small>
              </span>
              <Value value={row.value} />
            </div>
          ))}
        </section>
      )}

      <section
        aria-labelledby="record-wrong"
        className="flex flex-col gap-1 rounded-[18px] border-[1.5px] border-dashed border-destructive px-3.5 py-2.5"
      >
        <h2 id="record-wrong" className={`${EYEBROW} text-destructive`}>
          Where it has been wrong
        </h2>
        <p className="text-[13px] leading-snug text-foreground">
          {data.wrong === null
            ? `Once a kind or a lift has ${MIN_RESULTS_TO_JUDGE} results, this names where the app has leaned furthest one way.`
            : data.wrong === "none"
              ? "Nothing leans clearly one way: the misses fall about as often above the forecast as below it."
              : data.wrong.text}
        </p>
        {data.widened.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Ranges widened because too few results landed inside:{" "}
            {data.widened.map((w) => `${w.label.toLowerCase()} × ${formatAmount(w.scale)}`).join(", ")}.
          </p>
        )}
      </section>

      <section aria-labelledby="record-basis" className="flex flex-col">
        <h2 id="record-basis" className={`${EYEBROW} pb-1 text-muted-foreground`}>
          By how much history it had
        </h2>
        {BASIS_ORDER.filter((b) => (byBasis[b]?.ranges.n ?? 0) > 0).map((b) => {
          const r = byBasis[b]!;
          const judged = judgeShare(r.ranges.inside, r.ranges.n, "inside the range");
          return (
            <div key={b} className={ROW} data-basis={b}>
              <span className="min-w-0">
                <b className="block text-sm font-semibold text-foreground">{BASIS_LABELS[b]}</b>
                <small className="block text-xs text-muted-foreground">{judged.counts}</small>
              </span>
              <Value value={judged.value} />
            </div>
          );
        })}
        {BASIS_ORDER.every((b) => (byBasis[b]?.ranges.n ?? 0) === 0) && (
          <p className="text-[13px] text-muted-foreground">No ranges came due {periodWords}.</p>
        )}
      </section>

      <p className="text-xs leading-snug text-muted-foreground" data-slot="void-line">
        {data.voids ?? "No forecast has been set aside. One is, never as a miss, when the weight changes, the workout ends early or the lift is not reached."}
      </p>
    </div>
  );
}
