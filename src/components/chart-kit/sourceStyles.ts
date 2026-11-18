// How each source of the strength trend chart is drawn: a colour token AND a shape, so
// no source is told apart by colour alone. Pure.
import type { DotShape } from "./trendGeometry";

export interface SourceStyle {
  /** A chart colour token, e.g. "var(--chart-series-2)". */
  color: string;
  shape: DotShape;
  /** Drawn as an outline: an imported session. */
  hollow: boolean;
  /** Hatched in the contribution strip (imported). */
  hatched: boolean;
}

/** The main line's colour: the chart kit's accent. */
export const TREND_LINE_COLOR = "var(--chart-line)";

const COLORS = ["var(--chart-line)", "var(--chart-series-2)", "var(--chart-series-3)", "var(--chart-series-4)"];
const RELATED_SHAPES: DotShape[] = ["square", "triangle", "diamond", "triangle-down", "cross"];
const ALL_SHAPES: DotShape[] = ["circle", "square", "triangle", "diamond", "triangle-down", "cross"];

/**
 * Styles for a lift's sources: its own sessions are filled circles in the line's colour,
 * its imported ones hollow circles, and each related exercise the next series colour
 * with its own shape.
 */
export function liftSourceStyles(sources: readonly { id: string; kind: string }[]): Map<string, SourceStyle> {
  const out = new Map<string, SourceStyle>();
  let related = 0;
  for (const s of sources) {
    if (s.kind === "own") out.set(s.id, { color: COLORS[0], shape: "circle", hollow: false, hatched: false });
    else if (s.kind === "imported") out.set(s.id, { color: COLORS[0], shape: "circle", hollow: true, hatched: true });
    else {
      out.set(s.id, {
        color: COLORS[1 + (related % 3)],
        shape: RELATED_SHAPES[related % RELATED_SHAPES.length],
        hollow: false,
        hatched: false,
      });
      related += 1;
    }
  }
  return out;
}

/**
 * Styles for a muscle's exercises: colours repeat every four and shapes every six, so
 * the first twelve exercises each have their own pair.
 */
export function exerciseSourceStyles(sources: readonly { id: string }[]): Map<string, SourceStyle> {
  return new Map(
    sources.map((s, i) => [
      s.id,
      { color: COLORS[i % COLORS.length], shape: ALL_SHAPES[i % ALL_SHAPES.length], hollow: false, hatched: false },
    ])
  );
}
