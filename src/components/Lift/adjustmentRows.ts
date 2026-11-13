// What a dated lift adjustment says, in words. Pure: no React, no database.
import { formatLbs } from "@/components/LogEdit/format";
import type { LiftAdjustment } from "@/types";

export interface WeightChangeRow {
  id: string;
  /** Epoch ms of the change; null for starting weights set before any dated entry. */
  t: number | null;
  /** "Starting weights", "Manual change", "Reduced after time off", "Imported". */
  source: string;
  /** "T1 205 lbs 6x2 · T2 140 lbs", or a sentence when no weight or stage was set. */
  detail: string;
  note?: string;
}

const SOURCE_TEXT: Record<LiftAdjustment["source"], string> = {
  start: "Starting weights",
  manual: "Manual change",
  decay: "Reduced after time off",
  import: "Imported",
};

function tierText(label: string, weight: number | undefined, stage?: string): string | null {
  if (weight === undefined && stage === undefined) return null;
  if (weight === undefined) return `${label} stage ${stage}`;
  return `${label} ${formatLbs(weight)} lbs${stage ? ` ${stage}` : ""}`;
}

/**
 * One row of the "Weight changes" list. A `start` adjustment lists every field of
 * the lift, so a tier it leaves at 0 (a tier the lift is never trained in) is left out.
 */
export function describeAdjustment(adjustment: LiftAdjustment): WeightChangeRow {
  const set = adjustment.set ?? {};
  const isStart = adjustment.source === "start";
  const used = (weight: number | undefined) => !(isStart && (weight ?? 0) === 0);

  const parts = [
    used(set.t1Weight) ? tierText("T1", set.t1Weight, set.t1Stage) : null,
    used(set.t2Weight) ? tierText("T2", set.t2Weight, set.t2Stage) : null,
    used(set.t3Weight) ? tierText("T3", set.t3Weight) : null,
  ].filter((part): part is string => part !== null);

  const time = new Date(adjustment.at).getTime();
  return {
    id: adjustment.id,
    // Seeded starting weights are dated at the epoch: they have no real date.
    t: Number.isFinite(time) && time > 0 ? time : null,
    source: SOURCE_TEXT[adjustment.source] ?? "Change",
    detail: parts.length > 0 ? parts.join(" · ") : "Progression counters only, no weight change",
    ...(adjustment.note ? { note: adjustment.note } : {}),
  };
}

/** Rows for the list, in the order given (the hook returns newest first). */
export function weightChangeRows(adjustments: LiftAdjustment[]): WeightChangeRow[] {
  return adjustments.map(describeAdjustment);
}
