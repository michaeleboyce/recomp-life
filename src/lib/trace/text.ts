// Small wording helpers for trace steps. Plain language: "last set", not "AMRAP".
import { formatNumber } from "@/lib/metrics/helpers";
import type { BodyRegion, TraceOp, TraceStep, TraceUnit } from "@/types";

/** 205 -> "205", 87.5 -> "87.5". */
export function num(value: number): string {
  return formatNumber(value, 1);
}

/** "a", "a and b", "a, b and c" (or with "or"). */
export function joinList(items: string[], last: "and" | "or" = "and"): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${last} ${items[items.length - 1]}`;
}

/** "Nov 6", in the device's time zone. */
export function shortDay(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "5x3" -> "5 sets of 3". Anything else is returned as it is. */
export function stageWords(stage: string | undefined): string {
  const match = /^(\d+)x(\d+)$/.exec(stage ?? "");
  return match ? `${match[1]} sets of ${match[2]}` : (stage ?? "");
}

/** "lower_back" -> "lower back". */
export function regionWords(region: BodyRegion): string {
  return region.split("_").join(" ");
}

/** One step. `value` is left out for a check that changed nothing. */
export function step(
  id: string,
  title: string,
  detail: string,
  op: TraceOp,
  unit: TraceUnit,
  value?: number,
  ruleId?: string
): TraceStep {
  return {
    id,
    title,
    detail,
    effect: value === undefined ? { op, unit } : { op, value, unit },
    ...(ruleId ? { ruleId } : {}),
  };
}

/** A signed change as a step effect: "add" when it moved, "none" when it did not. */
export function change(delta: number): { op: TraceOp; value?: number } {
  return delta === 0 ? { op: "none" } : { op: "add", value: delta };
}
