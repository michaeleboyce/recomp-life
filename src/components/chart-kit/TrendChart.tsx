"use client";

import { useMemo, useState, type KeyboardEvent, type ReactElement } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MouseHandlerDataParam } from "recharts/types/synchronisation/types";
import type { Point, Series, Unit } from "@/lib/metrics/types";
import { cn } from "@/lib/utils";
import { ChartEmpty } from "./ChartEmpty";
import { formatNumber, formatShortDate, niceScale, timeTicks } from "./scale";

export type OverlayStyle = "solid" | "dashed" | "dotted";

export interface TrendOverlay {
  id: string;
  /** Shown in the legend under the chart. */
  label: string;
  points: Point[];
  /** Defaults by position: solid, dashed, dotted. */
  style?: OverlayStyle;
  /** Shaded range drawn behind the line, e.g. the uncertainty of a trend fit. */
  band?: Array<{ t: number; low: number; high: number }>;
}

export interface TrendTarget {
  low?: number;
  high?: number;
  label?: string;
}

interface TrendChartBaseProps {
  /** Plot height in px (default 170). */
  height?: number;
  variant?: "line" | "area" | "steps";
  /** Draw every point. Defaults to true for a line with at most 24 points. The last point always gets a dot. */
  showPoints?: boolean;
  /** "auto" (default) pads the data range and does not start at zero. */
  yDomain?: "auto" | [number, number];
  /** Shaded horizontal band, e.g. the target loss rate. */
  target?: TrendTarget;
  /** Extra lines (trend fit, projected alternatives). At most three; each gets the next series colour. */
  overlays?: TrendOverlay[];
  /** Vertical dashed line at this instant, e.g. "today" on a projection. */
  nowMarker?: number;
  /** Formats values in the inspector and end labels. Without it the unit is appended. */
  formatValue?: (v: number) => string;
  /** Formats x-axis ticks and the inspector date (default "Oct 26"). */
  formatTime?: (t: number) => string;
  onSelectPoint?: (point: Point | null) => void;
  ariaLabel: string;
  /** Legend name of the main series; the legend appears only when there are overlays. */
  seriesLabel?: string;
  emptyMessage?: string;
  className?: string;
}

export type TrendChartProps = TrendChartBaseProps &
  ({ series: Series; data?: never; unit?: never } | { data: Point[]; unit?: Unit; series?: never });

const MAX_OVERLAYS = 3;
const OVERLAY_COLORS = ["var(--chart-series-2)", "var(--chart-series-3)", "var(--chart-series-4)"];
const DEFAULT_STYLES: OverlayStyle[] = ["solid", "dashed", "dotted"];
const DASH: Record<OverlayStyle, string | undefined> = {
  solid: undefined,
  dashed: "7 4",
  dotted: "2 4",
};

const AXIS_TICK = { fontSize: 10, fill: "var(--chart-axis)" };
const Y_AXIS_WIDTH = 36;
const X_AXIS_HEIGHT = 22;
const MARGIN_TOP = 8;
const LABEL_GAP = 12;
const DAY = 86_400_000;

type Row = { t: number; v?: number } & Record<string, number | [number, number] | undefined>;

const overlayKey = (i: number) => `o${i}`;
const bandKey = (i: number) => `b${i}`;

function buildRows(points: Point[], overlays: TrendOverlay[]): Row[] {
  const rows = new Map<number, Row>();
  const row = (t: number) => {
    let r = rows.get(t);
    if (!r) rows.set(t, (r = { t }));
    return r;
  };
  for (const p of points) row(p.t).v = p.v;
  overlays.forEach((o, i) => {
    for (const p of o.points) row(p.t)[overlayKey(i)] = p.v;
    for (const b of o.band ?? []) row(b.t)[bandKey(i)] = [b.low, b.high];
  });
  return [...rows.values()].sort((a, b) => a.t - b.t);
}

/** Pushes labels apart so that none are closer than `gap` px; returns offsets. */
function spreadLabels(ys: number[], gap: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const placed: number[] = [];
  order.forEach((o, k) => {
    placed[k] = k === 0 ? o.y : Math.max(o.y, placed[k - 1] + gap);
  });
  const offsets = new Array<number>(ys.length);
  order.forEach((o, k) => (offsets[o.i] = placed[k] - o.y));
  return offsets;
}

function nearestIndex(points: Point[], t: number): number {
  let best = 0;
  for (let i = 1; i < points.length; i++) {
    if (Math.abs(points[i].t - t) < Math.abs(points[best].t - t)) best = i;
  }
  return best;
}

export function TrendChart(props: TrendChartProps) {
  const {
    height = 170,
    variant = "line",
    yDomain = "auto",
    target,
    nowMarker,
    formatValue,
    formatTime = formatShortDate,
    onSelectPoint,
    ariaLabel,
    seriesLabel,
    emptyMessage,
    className,
  } = props;
  const points = useMemo(() => props.series?.points ?? props.data ?? [], [props.series, props.data]);
  const unit = props.series?.unit ?? props.unit;
  const overlays = useMemo(() => {
    const all = props.overlays ?? [];
    if (all.length > MAX_OVERLAYS && process.env.NODE_ENV !== "production") {
      console.warn(`TrendChart draws at most ${MAX_OVERLAYS} overlays; ${all.length} given.`);
    }
    return all.slice(0, MAX_OVERLAYS);
  }, [props.overlays]);
  const showPoints = props.showPoints ?? (variant === "line" && points.length <= 24);

  const [selected, setSelected] = useState<number | null>(null);
  const selectedPoint = selected !== null ? (points[selected] ?? null) : null;

  const rows = useMemo(() => buildRows(points, overlays), [points, overlays]);

  const scale = useMemo(() => {
    if (yDomain !== "auto") {
      const [lo, hi] = yDomain;
      return { domain: yDomain, ticks: [0, 1, 2, 3].map((k) => lo + ((hi - lo) * k) / 3) };
    }
    const values: number[] = points.map((p) => p.v);
    for (const o of overlays) {
      values.push(...o.points.map((p) => p.v));
      for (const b of o.band ?? []) values.push(b.low, b.high);
    }
    if (target?.low !== undefined) values.push(target.low);
    if (target?.high !== undefined) values.push(target.high);
    return niceScale(values);
  }, [yDomain, points, overlays, target]);

  if (rows.length === 0) return <ChartEmpty message={emptyMessage} height={height} />;

  const minT = rows[0].t;
  const maxT = rows[rows.length - 1].t;
  const xDomain: [number, number] = minT === maxT ? [minT - DAY, maxT + DAY] : [minT, maxT];
  const [lo, hi] = scale.domain;
  const marginRight = overlays.length > 0 ? 34 : 8;

  const fmt = (v: number) => (formatValue ? formatValue(v) : formatNumber(v));
  const fmtWithUnit = (v: number) => (formatValue ? formatValue(v) : `${formatNumber(v)}${unit ? ` ${unit}` : ""}`);

  // End labels: estimate their pixel positions and push colliding ones apart.
  const plotH = height - MARGIN_TOP - X_AXIS_HEIGHT;
  const endValues = overlays.map((o) => o.points[o.points.length - 1]?.v ?? lo);
  const labelOffsets = spreadLabels(
    endValues.map((v) => (1 - (v - lo) / (hi - lo || 1)) * plotH),
    LABEL_GAP
  );
  const lastRowOf = overlays.map((_, i) => {
    for (let r = rows.length - 1; r >= 0; r--) if (rows[r][overlayKey(i)] !== undefined) return r;
    return -1;
  });
  const lastMainRow = (() => {
    for (let r = rows.length - 1; r >= 0; r--) if (rows[r].v !== undefined) return r;
    return -1;
  })();

  function select(index: number | null) {
    const next = index === null || points.length === 0 ? null : Math.max(0, Math.min(points.length - 1, index));
    if (next === selected) return;
    setSelected(next);
    onSelectPoint?.(next === null ? null : points[next]);
  }

  function onPointer(state: MouseHandlerDataParam) {
    if (points.length === 0) return;
    let t = Number(state.activeLabel);
    if (!Number.isFinite(t)) {
      const idx = Number(state.activeTooltipIndex);
      if (!Number.isFinite(idx) || !rows[idx]) return;
      t = rows[idx].t;
    }
    select(nearestIndex(points, t));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (points.length === 0) return;
    const last = points.length - 1;
    const keys: Record<string, number | null> = {
      ArrowRight: selected === null ? last : selected + 1,
      ArrowLeft: selected === null ? last : selected - 1,
      Home: 0,
      End: last,
      Escape: null,
    };
    if (!(e.key in keys)) return;
    e.preventDefault();
    select(keys[e.key]);
  }

  const mainStroke = "var(--chart-line)";
  const dotStyle = { r: 4, fill: mainStroke, stroke: "var(--chart-point-ring)", strokeWidth: 2 };
  const endDot = (p: { cx?: number; cy?: number; index?: number }): ReactElement => {
    if (p.index !== lastMainRow || p.cx == null || p.cy == null) return <g key={`d${p.index}`} />;
    return <circle key={`d${p.index}`} cx={p.cx} cy={p.cy} {...dotStyle} />;
  };
  const dot = showPoints ? dotStyle : endDot;
  const curveType = variant === "steps" ? "stepAfter" : "linear";

  const xTick = (p: { x?: number | string; y?: number | string; index?: number; payload?: { value: number } }) => {
    const anchor = p.index === 0 ? "start" : p.index === rows.length - 1 || p.payload?.value === maxT ? "end" : "middle";
    return (
      <text x={p.x} y={p.y} dy={10} textAnchor={minT === maxT ? "middle" : anchor} {...AXIS_TICK}>
        {p.payload ? formatTime(p.payload.value) : ""}
      </text>
    );
  };

  const inspectorFrac = selectedPoint ? (selectedPoint.t - xDomain[0]) / (xDomain[1] - xDomain[0]) : 0;
  const inspectorText = selectedPoint
    ? [formatTime(selectedPoint.t), selectedPoint.label, fmtWithUnit(selectedPoint.v)].filter(Boolean).join(", ")
    : "";

  return (
    <div className={cn("font-mono", className)}>
      <div className="relative">
        <div
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          style={{ height }}
        >
          <ResponsiveContainer width="100%" height={height}>
            <ComposedChart
              data={rows}
              margin={{ top: MARGIN_TOP, right: marginRight, bottom: 0, left: 0 }}
              onMouseMove={onPointer}
              onClick={onPointer}
              onTouchStart={onPointer}
              onTouchMove={onPointer}
              onMouseLeave={() => select(null)}
            >
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                type="number"
                dataKey="t"
                domain={xDomain}
                ticks={timeTicks(minT, maxT)}
                interval={0}
                tick={xTick}
                tickLine={false}
                axisLine={false}
                height={X_AXIS_HEIGHT}
              />
              <YAxis
                type="number"
                domain={scale.domain}
                ticks={scale.ticks}
                interval={0}
                tickFormatter={formatNumber}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={Y_AXIS_WIDTH}
              />
              <Tooltip content={() => null} cursor={false} isAnimationActive={false} />
              {target && (
                <ReferenceArea
                  y1={target.low ?? lo}
                  y2={target.high ?? hi}
                  fill="var(--chart-band)"
                  fillOpacity={1}
                  stroke="none"
                  ifOverflow="hidden"
                  label={
                    target.label
                      ? { value: target.label, position: "insideTopRight", ...AXIS_TICK }
                      : undefined
                  }
                />
              )}
              {overlays.map((o, i) =>
                o.band?.length ? (
                  <Area
                    key={`band-${o.id}`}
                    className="chart-overlay-band"
                    dataKey={bandKey(i)}
                    type="linear"
                    stroke="none"
                    fill={OVERLAY_COLORS[i]}
                    fillOpacity={0.16}
                    connectNulls
                    isAnimationActive={false}
                    activeDot={false}
                    legendType="none"
                  />
                ) : null
              )}
              {variant === "area" ? (
                <Area
                  dataKey="v"
                  type={curveType}
                  stroke={mainStroke}
                  strokeWidth={2}
                  fill="var(--chart-area)"
                  fillOpacity={1}
                  dot={dot}
                  activeDot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  dataKey="v"
                  type={curveType}
                  stroke={mainStroke}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  dot={dot}
                  activeDot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              {overlays.map((o, i) => {
                const style = o.style ?? DEFAULT_STYLES[i];
                return (
                  <Line
                    key={`line-${o.id}`}
                    dataKey={overlayKey(i)}
                    name={o.label}
                    type="linear"
                    stroke={OVERLAY_COLORS[i]}
                    strokeWidth={2}
                    strokeDasharray={DASH[style]}
                    strokeLinecap="round"
                    dot={false}
                    activeDot={false}
                    connectNulls
                    isAnimationActive={false}
                    label={(lp: { x?: number | string; y?: number | string; index?: number; value?: unknown }) =>
                      lp.index === lastRowOf[i] && lp.x != null && lp.y != null ? (
                        <text
                          key={`end-${o.id}`}
                          x={Number(lp.x) + 4}
                          y={Number(lp.y) + labelOffsets[i]}
                          dy={4}
                          fontSize={11}
                          fontWeight={700}
                          fill="var(--foreground)"
                        >
                          {fmt(Number(lp.value))}
                        </text>
                      ) : (
                        <g key={`end-${o.id}-${lp.index}`} />
                      )
                    }
                  />
                );
              })}
              {nowMarker !== undefined && (
                <ReferenceLine x={nowMarker} stroke="var(--chart-axis)" strokeDasharray="3 3" strokeOpacity={0.6} />
              )}
              {selectedPoint && (
                <ReferenceLine x={selectedPoint.t} stroke="var(--chart-inspect)" strokeDasharray="3 3" />
              )}
              {selectedPoint && (
                <ReferenceDot
                  x={selectedPoint.t}
                  y={selectedPoint.v}
                  r={6}
                  fill="var(--chart-inspect)"
                  stroke="var(--chart-point-ring)"
                  strokeWidth={2}
                  ifOverflow="visible"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {selectedPoint && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 rounded-lg bg-card-raised px-2.5 py-1.5 whitespace-nowrap shadow-sm"
            style={{
              left: `calc(${Y_AXIS_WIDTH}px + (100% - ${Y_AXIS_WIDTH + marginRight}px) * ${inspectorFrac})`,
              transform: `translateX(${inspectorFrac < 0.34 ? "8px" : inspectorFrac > 0.66 ? "calc(-100% - 8px)" : "-50%"})`,
            }}
          >
            <div className="text-[11px] text-chart-axis">
              {formatTime(selectedPoint.t)}
              {selectedPoint.label ? ` · ${selectedPoint.label}` : ""}
            </div>
            <div className="text-xs font-bold text-foreground">{fmtWithUnit(selectedPoint.v)}</div>
          </div>
        )}
      </div>
      <p aria-live="polite" className="sr-only">
        {inspectorText}
      </p>
      {overlays.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-sans text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <svg aria-hidden="true" width="18" height="6">
              <path d="M0 3h18" stroke={mainStroke} strokeWidth={2} />
            </svg>
            {seriesLabel ?? "History"}
          </li>
          {overlays.map((o, i) => {
            const style = o.style ?? DEFAULT_STYLES[i];
            return (
              <li key={o.id} className="flex items-center gap-1.5">
                <svg aria-hidden="true" width="18" height="6">
                  <path
                    d="M1 3h16"
                    stroke={OVERLAY_COLORS[i]}
                    strokeWidth={2}
                    strokeDasharray={DASH[style]}
                    strokeLinecap="round"
                  />
                </svg>
                {o.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
