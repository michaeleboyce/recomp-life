"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RotateCcw, Table2, X } from "lucide-react";
import { RangeTabs, formatShortDate } from "@/components/chart-kit";
import { StrengthTrendChart } from "@/components/chart-kit/StrengthTrendChart";
import { WindowRange } from "@/components/chart-kit/WindowRange";
import { exerciseSourceStyles, liftSourceStyles, type SourceStyle } from "@/components/chart-kit/sourceStyles";
import { lineValueAt, shapePath } from "@/components/chart-kit/trendGeometry";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { rangeSuffix } from "@/components/Progress/rangeText";
import { Delta } from "@/components/ui/delta";
import { DAY_MS } from "@/lib/dates";
import { ALL_RANGE_KEYS, isZoomed, windowBounds, type WindowSpan } from "@/lib/metrics/window";
import type { RangeKey } from "@/lib/metrics/types";
import {
  SMOOTHING_KEYS,
  TREND_SMOOTHING,
  sharesAt,
  smoothedEstimate,
  weeklyShares,
  type SmoothingKey,
  type StrengthTimeline,
  type TimelinePoint,
} from "@/lib/strength";
import { cn } from "@/lib/utils";
import { readTrendPrefs, writeTrendPrefs } from "./trendPrefs";
import {
  SMOOTHING_LABELS,
  formatTrendValue,
  pointDetail,
  reasonText,
  smoothingText,
  sourceDetail,
  sourceLabel,
  trendSummary,
} from "./trendText";

export interface StrengthTrendPanelProps {
  timeline: StrengthTimeline;
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
  /** The zoomed span, or null for the preset. */
  span: WindowSpan | null;
  onSpanChange: (span: WindowSpan | null) => void;
  /** The heading's content, e.g. "Estimated 1RM". */
  title: ReactNode;
  /** Beside the title, e.g. "· Imported". */
  titleExtra?: ReactNode;
  /** A line under the reason, e.g. what hiding imported history changes. */
  note?: ReactNode;
  ariaLabel: string;
  /** The today marker's word: "Plan" for a lift, "Index" for a muscle. */
  anchorLabel: string;
  emptyMessage?: string;
  headingLevel?: 2 | 3;
  /** Size of the big number. */
  size?: "lg" | "md";
  /** Test ids of the big number and its change (the lift page keeps its own). */
  anchorTestId?: string;
  changeTestId?: string;
}

const ICON_SWATCH = 14;

function Swatch({ style }: { style: SourceStyle }) {
  const c = ICON_SWATCH / 2;
  return (
    <svg width={ICON_SWATCH} height={ICON_SWATCH} aria-hidden="true" className="shrink-0">
      <path
        d={shapePath(style.shape, c, c, 4.5)}
        fill={style.hollow ? "var(--chart-point-ring)" : style.color}
        stroke={style.color}
        strokeWidth={style.hollow ? 1.75 : 0}
      />
    </svg>
  );
}

/**
 * The estimated-max chart with everything around it (M4 to M6): the planner's number
 * and the line's change over the window, why they differ, the window presets with zoom
 * and a reset, the smoothing control, the legend that switches sources, a point's
 * detail, a table view and the rule behind it (strength-pooling).
 */
export function StrengthTrendPanel({
  timeline,
  range,
  onRangeChange,
  span,
  onSpanChange,
  title,
  titleExtra,
  note,
  ariaLabel,
  anchorLabel,
  emptyMessage = "No sessions in this window",
  headingLevel = 2,
  size = "lg",
  anchorTestId = "trend-anchor",
  changeTestId = "trend-change",
}: StrengthTrendPanelProps) {
  const [smoothing, setSmoothing] = useState<SmoothingKey>("standard");
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const restored = useRef(false);

  // The remembered window and smoothing, once mounted (storage is the browser's).
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const prefs = readTrendPrefs();
    setSmoothing(prefs.smoothing);
    if (prefs.range && prefs.range !== range) onRangeChange(prefs.range);
  }, [range, onRangeChange]);

  const styles = useMemo(
    () => (timeline.subject.kind === "lift" ? liftSourceStyles(timeline.sources) : exerciseSourceStyles(timeline.sources)),
    [timeline]
  );
  const names = useMemo(
    () => new Map(timeline.sources.map((s) => [s.id, sourceLabel(s)])),
    [timeline]
  );
  const enabled = useMemo(() => timeline.sources.filter((s) => !off.has(s.id)).map((s) => s.id), [timeline, off]);
  const halfLifeDays = TREND_SMOOTHING[smoothing];
  const allOn = enabled.length === timeline.sources.length;
  const smoothOptions = useMemo(
    () => ({ halfLifeDays, sources: allOn ? undefined : enabled }),
    [halfLifeDays, allOn, enabled]
  );
  const line = useMemo(() => smoothedEstimate(timeline, smoothOptions), [timeline, smoothOptions]);
  const shares = useMemo(() => weeklyShares(timeline, smoothOptions), [timeline, smoothOptions]);
  const dots = useMemo(() => {
    const on = new Set(enabled);
    return timeline.points.filter((p) => on.has(p.sourceId) && p.t <= timeline.now);
  }, [timeline, enabled]);

  const firstT = timeline.points.length > 0 ? timeline.points[0].t : timeline.now;
  const limits = useMemo(() => ({ from: Math.min(firstT, timeline.now - 7 * DAY_MS), to: timeline.now }), [firstT, timeline.now]);
  const bounds = windowBounds({ range, span }, timeline.now);
  const view = useMemo(
    () => ({ from: Math.max(bounds.from, limits.from), to: Math.min(bounds.to, limits.to) }),
    [bounds.from, bounds.to, limits]
  );
  const zoomed = isZoomed({ range, span });

  const windowDots = dots.filter((d) => d.t >= view.from && d.t <= view.to);
  const hasImportedDot = timeline.points.some((p) => p.imported && p.sourceId !== "imported");
  const hasTarget = timeline.points.some((p) => p.provisional);
  const startValue = lineValueAt(line.points, Math.max(view.from, line.points[0]?.t ?? view.from));
  const endValue = lineValueAt(line.points, view.to);
  const change = startValue && endValue && endValue.t > startValue.t ? endValue.v - startValue.v : null;
  const unit = timeline.unit;
  const fmt = (v: number) => formatTrendValue(v, unit);
  const anchor = timeline.anchor;
  const reason = reasonText(line.reason, timeline);

  const selected = selectedId ? (timeline.points.find((p) => p.id === selectedId) ?? null) : null;
  const shareToday = useMemo(
    () => (selected ? (sharesAt(timeline, timeline.now, smoothOptions).get(selected.id) ?? 0) : 0),
    [selected, timeline, smoothOptions]
  );
  const detail = selected ? pointDetail(selected, timeline, timeline.now, halfLifeDays, shareToday) : null;

  const summary = trendSummary({
    timeline,
    from: view.from,
    to: view.to,
    first: startValue?.v ?? null,
    last: endValue?.v ?? null,
    dots: windowDots,
    sourceNames: names,
  });

  const changeRange = (next: RangeKey) => {
    onSpanChange(null);
    onRangeChange(next);
    writeTrendPrefs({ range: next });
  };
  const changeSmoothing = (next: SmoothingKey) => {
    setSmoothing(next);
    writeTrendPrefs({ smoothing: next });
  };
  const toggle = (id: string) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const onSelect = (p: TimelinePoint | null) => setSelectedId(p?.id ?? null);

  const Heading = `h${headingLevel}` as const;
  const shareOrder = timeline.sources.map((s) => s.id);
  const anchorMark = anchor ? { t: timeline.now, v: anchor.value, label: anchorLabel } : null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <Heading className="text-xs font-normal text-muted-foreground">
          {title}
          {titleExtra}
        </Heading>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            data-testid={anchorTestId}
            className={cn(
              "font-mono leading-none font-bold tabular-nums text-foreground",
              size === "lg" ? "text-[44px]" : "text-[34px]"
            )}
          >
            {anchor ? fmt(anchor.value) : "–"}
          </span>
          <span className="font-mono text-sm text-muted-foreground">{unit === "lbs" ? "lbs" : "index"}</span>
          {change !== null && (
            <Delta
              data-testid={changeTestId}
              value={unit === "lbs" ? Math.round(change) : Math.round(change * 10) / 10}
              better="up"
              suffix={`${rangeSuffix([{ t: view.from, v: 0 }, { t: view.to, v: 0 }])} on the line`}
              className="text-sm"
            />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <RangeTabs
          value={zoomed ? null : range}
          onChange={changeRange}
          options={ALL_RANGE_KEYS}
          ariaLabel="Chart window"
          className="-ml-2.5"
        />
        {zoomed && (
          <button
            type="button"
            onClick={() => onSpanChange(null)}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-foreground hover:bg-card-raised focus-visible:outline-2 focus-visible:outline-ring"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Reset
          </button>
        )}
      </div>
      {zoomed && (
        <p className="-mt-1.5 font-mono text-[12px] text-muted-foreground" data-testid="zoom-span">
          {formatShortDate(view.from)} – {formatShortDate(view.to)}
        </p>
      )}

      <StrengthTrendChart
        points={dots}
        line={line.knots}
        styles={styles}
        window={view}
        limits={limits}
        anchor={anchorMark}
        shares={shares}
        shareOrder={shareOrder}
        formatValue={fmt}
        ariaLabel={ariaLabel}
        selectedId={selectedId}
        onSelect={onSelect}
        onZoom={(s) => onSpanChange(s)}
        emptyMessage={emptyMessage}
      />
      <p className="-mt-1.5 text-[11px] text-muted-foreground">
        Strip: share of the line each week by source. Drag or pinch the chart, or move the ends below, to zoom.
      </p>
      <p className="sr-only" aria-live="polite" data-testid="trend-summary">
        {summary}
      </p>

      {detail && (
        <div
          role="region"
          aria-label="Session detail"
          data-testid="point-detail"
          className="relative rounded-xl bg-card-raised px-3.5 py-3 text-sm text-foreground"
        >
          <p className="pr-10 font-semibold">{detail.title}</p>
          <ul className="mt-1 space-y-0.5 text-[13px] text-muted-foreground">
            {detail.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <button
            type="button"
            aria-label="Close session detail"
            onClick={() => setSelectedId(null)}
            className="absolute top-1 right-1 inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <WindowRange value={view} limits={limits} onChange={(s) => onSpanChange(s)} />

      <ul className="flex flex-col gap-1" aria-label="Sources">
        <li className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <svg width={ICON_SWATCH} height={ICON_SWATCH} aria-hidden="true" className="shrink-0">
            <path d="M1 7h12" stroke="var(--chart-line)" strokeWidth={3} strokeLinecap="round" />
          </svg>
          <span>
            <span className="font-semibold text-foreground">Trend</span>, {smoothingText(smoothing).toLowerCase()}
          </span>
        </li>
        {anchor && (
          <li className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <svg width={ICON_SWATCH} height={ICON_SWATCH} aria-hidden="true" className="shrink-0">
              <circle cx={7} cy={7} r={5} fill="var(--chart-point-ring)" stroke="var(--chart-inspect)" strokeWidth={2} />
            </svg>
            <span>
              <span className="font-semibold text-foreground">{anchorLabel}</span>
              {timeline.unit === "lbs" ? ": the estimate the next workout plans from" : ": the index as the Muscles tab shows it"}
            </span>
          </li>
        )}
        {timeline.sources.map((s) => {
          const on = !off.has(s.id);
          const style = styles.get(s.id)!;
          return (
            <li key={s.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(s.id)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-left text-xs transition-colors hover:bg-card-raised focus-visible:outline-2 focus-visible:outline-ring",
                  !on && "opacity-50"
                )}
              >
                <Swatch style={style} />
                <span className="min-w-0 flex-1">
                  <span className={cn("font-semibold text-foreground", !on && "line-through")}>{names.get(s.id)}</span>
                  <span className="text-muted-foreground"> · {sourceDetail(s)}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{on ? "On" : "Off"}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {(hasImportedDot || hasTarget) && (
        <p className="px-1 text-xs text-muted-foreground">
          {hasImportedDot && "A hollow mark is a session imported from another app. "}
          {hasTarget && "A dashed outline is a weight you set by hand and have not lifted yet."}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Smoothing" className="flex items-center gap-0.5">
          <span className="mr-1 text-xs text-muted-foreground">Smoothing</span>
          {SMOOTHING_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={smoothing === key}
              onClick={() => changeSmoothing(key)}
              className={cn(
                "relative h-8 rounded-lg px-2 text-xs before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] focus-visible:outline-2 focus-visible:outline-ring",
                smoothing === key ? "bg-card-raised font-bold text-foreground" : "font-semibold text-chart-axis hover:text-foreground"
              )}
            >
              {SMOOTHING_LABELS[key]}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={showTable}
          onClick={() => setShowTable((v) => !v)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-foreground hover:bg-card-raised focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Table2 className="size-3.5" aria-hidden="true" />
          {showTable ? "Hide table" : "Show as table"}
        </button>
      </div>

      {reason && (
        <p data-testid="trend-reason" className="text-xs text-muted-foreground">
          {reason}
        </p>
      )}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}

      {showTable && (
        <div className="max-h-80 overflow-auto rounded-lg bg-card">
          <table className="w-full text-left text-xs" data-testid="trend-table">
            <caption className="sr-only">{summary}</caption>
            <thead className="sticky top-0 bg-card text-muted-foreground">
              <tr>
                <th scope="col" className="px-2 py-1.5 font-semibold">Date</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">Source</th>
                <th scope="col" className="px-2 py-1.5 text-right font-semibold">{unit === "lbs" ? "Counts as" : "Index"}</th>
                <th scope="col" className="px-2 py-1.5 text-right font-semibold">Line</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {[...windowDots].reverse().map((d) => {
                const at = lineValueAt(line.points, d.t);
                return (
                  <tr key={d.id} className="border-t border-border">
                    <td className="px-2 py-1">
                      <button
                        type="button"
                        onClick={() => setSelectedId(d.id)}
                        className="underline decoration-dotted underline-offset-2"
                      >
                        {formatShortDate(d.t)}
                      </button>
                    </td>
                    <td className="px-2 py-1 font-sans">
                      {names.get(d.sourceId)}
                      {d.provisional ? " (set by hand)" : d.imported && d.sourceId !== "imported" ? " (imported)" : ""}
                    </td>
                    <td className="px-2 py-1 text-right">{fmt(d.value)}</td>
                    <td className="px-2 py-1 text-right">{at ? fmt(at.v) : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <EvidenceLine ruleId="strength-pooling" />
    </div>
  );
}
