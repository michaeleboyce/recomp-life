"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { TimelinePoint, TrendPoint, WeekShare } from "@/lib/strength";
import { DAY_MS } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { ChartEmpty } from "./ChartEmpty";
import { formatNumber, niceScale } from "./scale";
import { TREND_LINE_COLOR, type SourceStyle } from "./sourceStyles";
import {
  bandPath,
  monotonePath,
  lineInSpan,
  linear,
  nearestWithin,
  shapePath,
  spanBetween,
  thinLine,
  timeAxisTicks,
  zoomSpan,
  type Span,
} from "./trendGeometry";

export interface StrengthTrendChartProps {
  /** Dots of the sources switched on (the chart keeps those inside the window). */
  points: readonly TimelinePoint[];
  /** The smooth line of the sources switched on: its value as of each session (knots). */
  line: readonly TrendPoint[];
  styles: ReadonlyMap<string, SourceStyle>;
  /** What is shown. */
  window: Span;
  /** How far zooming may reach: the first dot to today. */
  limits: Span;
  /** The number the app acts on, marked at today. */
  anchor: { t: number; v: number; label: string } | null;
  shares: readonly WeekShare[];
  /** Strip order, bottom first. */
  shareOrder: readonly string[];
  formatValue: (v: number) => string;
  ariaLabel: string;
  selectedId: string | null;
  onSelect: (point: TimelinePoint | null) => void;
  onZoom: (span: Span) => void;
  /** Plot height in px (default 200). */
  height?: number;
  emptyMessage?: string;
  className?: string;
}

const MARGIN = { top: 16, right: 14, bottom: 22 };
const Y_AXIS_MIN = 34;
const TICK_CHAR_W = 6.2;
const STRIP_GAP = 10;
const STRIP_H = 20;
const TAP_RADIUS = 22;
const DRAG_MIN_PX = 6;
const DOT_R = 3.75;
const FALLBACK_WIDTH = 340;
const AXIS_TEXT = { fontSize: 11, fill: "var(--chart-axis)" } as const;

/** The element's width, following resizes; a fallback where it cannot be measured. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setWidth(Math.round(w));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

type Gesture =
  | { kind: "none" }
  | { kind: "press"; x: number; y: number; mouse: boolean }
  | { kind: "drag"; x0: number; x1: number }
  | { kind: "pinch"; d0: number; span0: Span; center: number };

/**
 * The estimated-max chart: one bold smooth line with a soft one-sd band, the sessions
 * behind it as dots by source (colour and shape; hollow for imported, a dashed outline
 * for a weight not lifted yet), a today marker at the number the app acts on, and a
 * strip of which sources carry the line each week. Drag (mouse) or pinch (touch) to
 * zoom; tap a dot for its detail; arrow keys step through the dots. Tokens only; no
 * animation.
 */
export function StrengthTrendChart({
  points,
  line,
  styles,
  window,
  limits,
  anchor,
  shares,
  shareOrder,
  formatValue,
  ariaLabel,
  selectedId,
  onSelect,
  onZoom,
  height = 200,
  emptyMessage,
  className,
}: StrengthTrendChartProps) {
  const [ref, width] = useWidth();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const [gesture, setGesture] = useState<Gesture>({ kind: "none" });
  const [preview, setPreview] = useState<Span | null>(null);
  const view = preview ?? window;

  const dots = useMemo(() => points.filter((p) => p.t >= view.from && p.t <= view.to), [points, view]);
  const visibleLine = useMemo(() => lineInSpan(line, view), [line, view]);
  const anchorShown = anchor !== null && anchor.t >= view.from && anchor.t <= view.to;

  const scale = useMemo(() => {
    const values = dots.map((d) => d.value);
    // The band may run off the plot; the line and the dots set the scale.
    for (const p of visibleLine) values.push(p.v);
    if (anchorShown) values.push(anchor!.v);
    return niceScale(values, [5, 4, 3]);
  }, [dots, visibleLine, anchorShown, anchor]);

  const yAxisW = Math.max(Y_AXIS_MIN, Math.ceil(Math.max(...scale.ticks.map((t) => formatNumber(t).length)) * TICK_CHAR_W) + 8);
  const left = yAxisW;
  const right = Math.max(left + 10, width - MARGIN.right);
  const plotBottom = MARGIN.top + height - MARGIN.top - MARGIN.bottom;
  const x = linear(view.from, view.to, left, right);
  const y = linear(scale.domain[0], scale.domain[1], plotBottom, MARGIN.top);
  const stripTop = height + STRIP_GAP;
  const totalH = stripTop + STRIP_H;

  const dotXY = useMemo(() => dots.map((d) => ({ x: x(d.t), y: y(d.value) })), [dots, x, y]);
  const pathPoints = useMemo(
    () => thinLine(visibleLine, Math.max(2, Math.round(right - left))).map((p) => ({ x: x(p.t), y: y(p.v) })),
    [visibleLine, right, left, x, y]
  );

  if (points.length === 0 && line.length === 0) {
    return (
      <div role="img" aria-label={ariaLabel} data-points={0} data-imported={0} data-related={0} data-line="none">
        <ChartEmpty message={emptyMessage} height={height} />
      </div>
    );
  }

  const localXY = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    const p = localXY(e);
    pointers.current.set(e.pointerId, p);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      setGesture({
        kind: "pinch",
        d0: Math.max(10, Math.abs(a.x - b.x)),
        span0: view,
        center: x.invert((a.x + b.x) / 2),
      });
    } else if (pointers.current.size === 1) {
      setGesture({ kind: "press", x: p.x, y: p.y, mouse: e.pointerType === "mouse" });
    }
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    const p = localXY(e);
    pointers.current.set(e.pointerId, p);
    if (gesture.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.max(10, Math.abs(a.x - b.x));
      setPreview(zoomSpan(gesture.span0, d / gesture.d0, gesture.center, limits));
    } else if (gesture.kind === "press" && gesture.mouse && Math.abs(p.x - gesture.x) > DRAG_MIN_PX) {
      setGesture({ kind: "drag", x0: gesture.x, x1: p.x });
    } else if (gesture.kind === "drag") {
      setGesture({ kind: "drag", x0: gesture.x0, x1: p.x });
    }
  }

  function finish(e: PointerEvent<SVGSVGElement>, cancelled: boolean) {
    pointers.current.delete(e.pointerId);
    if (gesture.kind === "pinch") {
      if (pointers.current.size === 0) {
        if (preview && !cancelled) onZoom(preview);
        setPreview(null);
        setGesture({ kind: "none" });
      }
      return;
    }
    if (!cancelled && gesture.kind === "drag") {
      const a = x.invert(Math.max(left, Math.min(right, gesture.x0)));
      const b = x.invert(Math.max(left, Math.min(right, gesture.x1)));
      onZoom(spanBetween(a, b, limits));
    } else if (!cancelled && gesture.kind === "press") {
      const p = localXY(e);
      const i = nearestWithin(dotXY, p.x, p.y, TAP_RADIUS);
      onSelect(i >= 0 ? dots[i] : null);
    }
    setGesture({ kind: "none" });
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (dots.length === 0) return;
    const current = dots.findIndex((d) => d.id === selectedId);
    const last = dots.length - 1;
    const moves: Record<string, number | null> = {
      ArrowRight: current < 0 ? last : Math.min(last, current + 1),
      ArrowLeft: current < 0 ? last : Math.max(0, current - 1),
      Home: 0,
      End: last,
      Escape: null,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const next = moves[e.key];
    onSelect(next === null ? null : dots[next]);
  }

  const ticks = timeAxisTicks(view, width < 420 ? 3 : 5);
  const hatchId = `${uid}-hatch`;
  const clipId = `${uid}-clip`;
  const imported = dots.filter((d) => d.imported).length;
  const own = dots.filter((d) => d.sourceId === "own" || d.sourceId === "imported").length;
  const weeks = shares.filter((w) => w.weekStart + 7 * DAY_MS > view.from && w.weekStart < view.to);

  return (
    <div ref={ref} data-sheet-no-drag="" className={cn("relative w-full font-mono", className)}>
      <div
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={onKeyDown}
        data-points={own}
        data-imported={imported}
        data-related={dots.length - own}
        data-line={line.length > 0 ? "smooth" : "none"}
        className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <svg
          width={width}
          height={totalH}
          viewBox={`0 0 ${width} ${totalH}`}
          aria-hidden="true"
          className="block touch-pan-y select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => finish(e, false)}
          onPointerCancel={(e) => finish(e, true)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={left} y={0} width={Math.max(0, right - left)} height={height} />
            </clipPath>
            <pattern id={hatchId} patternUnits="userSpaceOnUse" width={4} height={4} patternTransform="rotate(45)">
              <rect width={4} height={4} fill="var(--chart-point-ring)" />
              <line x1={1} y1={0} x2={1} y2={4} stroke={TREND_LINE_COLOR} strokeWidth={2} />
            </pattern>
          </defs>

          {scale.ticks.map((t) => (
            <g key={`y${t}`}>
              <line x1={left} x2={right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
              <text x={left - 6} y={y(t)} dy={4} textAnchor="end" {...AXIS_TEXT}>
                {formatNumber(t)}
              </text>
            </g>
          ))}
          {ticks.map((tick, i) => {
            const tx = x(tick.t);
            const anchorText = tx < left + 18 ? "start" : tx > right - 18 ? "end" : "middle";
            return (
              <text key={`x${tick.t}-${i}`} x={tx} y={plotBottom + 16} textAnchor={anchorText} {...AXIS_TEXT}>
                {tick.label}
              </text>
            );
          })}

          <g clipPath={`url(#${clipId})`}>
            {visibleLine.length > 1 && (
              <path d={bandPath(thinLine(visibleLine, 400), x, y)} fill="var(--chart-area)" stroke="none" />
            )}
            {dots.map((d, i) => {
              const style = styles.get(d.sourceId);
              if (!style) return null;
              const hollow = style.hollow || d.imported || d.provisional;
              const selected = d.id === selectedId;
              const r = selected ? DOT_R + 2 : DOT_R;
              return (
                <path
                  key={d.id}
                  data-dot={d.sourceId}
                  data-kind={d.provisional ? "target" : d.imported ? "imported" : "logged"}
                  d={shapePath(style.shape, dotXY[i].x, dotXY[i].y, r)}
                  fill={hollow ? "var(--chart-point-ring)" : style.color}
                  fillOpacity={hollow ? 1 : 0.6}
                  stroke={style.color}
                  strokeOpacity={selected ? 1 : 0.75}
                  strokeWidth={hollow ? 1.5 : selected ? 2 : 0}
                  strokeDasharray={d.provisional ? "2 2" : undefined}
                />
              );
            })}
            {pathPoints.length > 1 && (
              <>
                <path d={monotonePath(pathPoints)} fill="none" stroke="var(--chart-point-ring)" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
                <path
                  data-testid="trend-line"
                  d={monotonePath(pathPoints)}
                  fill="none"
                  stroke={TREND_LINE_COLOR}
                  strokeWidth={3.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </>
            )}
            {selectedId &&
              dots.map((d, i) =>
                d.id === selectedId ? (
                  <circle
                    key="sel"
                    cx={dotXY[i].x}
                    cy={dotXY[i].y}
                    r={DOT_R + 5}
                    fill="none"
                    stroke="var(--chart-inspect)"
                    strokeWidth={1.5}
                  />
                ) : null
              )}
          </g>

          {anchorShown && (
            <g data-testid="today-marker">
              <line
                x1={x(anchor!.t)}
                x2={x(anchor!.t)}
                y1={MARGIN.top - 4}
                y2={plotBottom}
                stroke="var(--chart-axis)"
                strokeDasharray="3 3"
                strokeOpacity={0.7}
              />
              <circle cx={x(anchor!.t)} cy={y(anchor!.v)} r={6} fill="var(--chart-point-ring)" stroke="var(--chart-inspect)" strokeWidth={2} />
              <circle cx={x(anchor!.t)} cy={y(anchor!.v)} r={2} fill="var(--chart-inspect)" />
              <text
                x={x(anchor!.t) - 10}
                y={Math.max(MARGIN.top + 2, y(anchor!.v) - 10)}
                textAnchor="end"
                fontSize={11}
                fontWeight={700}
                fill="var(--chart-inspect)"
                stroke="var(--chart-point-ring)"
                strokeWidth={4}
                paintOrder="stroke"
              >
                {anchor!.label} {formatValue(anchor!.v)}
              </text>
            </g>
          )}

          {gesture.kind === "drag" && (
            <rect
              x={Math.min(gesture.x0, gesture.x1)}
              y={MARGIN.top}
              width={Math.abs(gesture.x1 - gesture.x0)}
              height={plotBottom - MARGIN.top}
              fill="var(--chart-band)"
              stroke="var(--chart-axis)"
              strokeDasharray="3 3"
            />
          )}

          <g data-testid="share-strip">
            <rect x={left} y={stripTop} width={Math.max(0, right - left)} height={STRIP_H} fill="var(--chart-grid)" />
            {weeks.map((w) => {
              const x0 = Math.max(left, x(w.weekStart));
              const x1 = Math.min(right, x(w.weekStart + 7 * DAY_MS));
              if (x1 - x0 <= 0) return null;
              let acc = 0;
              return (
                <g key={w.weekStart}>
                  {shareOrder.map((id) => {
                    const share = w.shares[id] ?? 0;
                    if (share <= 0) return null;
                    const style = styles.get(id);
                    const h = share * STRIP_H;
                    const top = stripTop + STRIP_H - acc - h;
                    acc += h;
                    return (
                      <rect
                        key={id}
                        x={x0}
                        y={top}
                        width={Math.max(0.5, x1 - x0 - 0.5)}
                        height={h}
                        fill={style?.hatched ? `url(#${hatchId})` : (style?.color ?? TREND_LINE_COLOR)}
                        fillOpacity={style?.hatched ? 1 : 0.85}
                      />
                    );
                  })}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
