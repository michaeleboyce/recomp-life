// Changes made to a lift outside a workout (`liftAdjustments` rows) as log entries:
// starting weights, a change by hand, a reduction after time off, an import. An
// adjustment only records the new values, so the earlier ones are read by replaying
// the adjustments over the rebuild's snapshots. Pure.
import { MAIN_LIFTS } from "@/lib/liftNames";
import type { RuleId } from "@/lib/evidence";
import { emptyLiftState } from "@/lib/rebuild";
import type {
  AdjustableField,
  AdjustmentEntry,
  LiftAdjustment,
  LiftState,
  Tier,
  WorkoutSession,
} from "@/types";
import {
  compareIds,
  isLive,
  joinList,
  lbs,
  liftHref,
  liftLabel,
  liftShort,
  FEED_HREFS,
  scheme,
  tierTag,
  toDate,
  toMs,
} from "./text";
import {
  SOURCE_RANK,
  type AdjustmentFeedInput,
  type AdjustmentUndo,
  type RankedEntry,
} from "./types";

type Log = Pick<AdjustmentFeedInput, "workouts" | "adjustments" | "rebuild">;
type Values = LiftAdjustment["set"];

/** The fields an adjustment can set, by the tier they belong to. */
const TIER_FIELDS: ReadonlyArray<{
  tier: Extract<Tier, "T1" | "T2" | "T3">;
  weight: AdjustableField;
  stage?: AdjustableField;
  other: readonly AdjustableField[];
}> = [
  { tier: "T1", weight: "t1Weight", stage: "t1Stage", other: ["t1FailCount", "t1LastResetWeight"] },
  { tier: "T2", weight: "t2Weight", stage: "t2Stage", other: ["t2FailCount", "t2LastResetWeight"] },
  { tier: "T3", weight: "t3Weight", other: [] },
];

/** Sources whose change another adjustment can take back. A start or an import cannot be. */
const UNDOABLE: ReadonlySet<LiftAdjustment["source"]> = new Set(["manual", "decay"]);

/** The note on the adjustment that undoes another. */
export const UNDO_NOTE = "Undo of an earlier change";

/** The evidence rule behind an accepted reduction after time off. */
const TIME_OFF_RULE: RuleId = "time-off";

const SOURCE_REASON: Record<Exclude<LiftAdjustment["source"], "start">, string> = {
  manual: "You set this yourself, outside a workout.",
  decay: "You took the lighter weight the app suggested after time off.",
  import: "Brought in with imported data.",
};

/** Every field of one tier: its weight, its scheme and its fail and reset record. */
function allFields(t: (typeof TIER_FIELDS)[number]): AdjustableField[] {
  return [t.weight, ...(t.stage ? [t.stage] : []), ...t.other];
}

/** The fields a row really sets (a key holding `undefined` sets nothing). */
function fieldsOf(adjustment: LiftAdjustment): AdjustableField[] {
  const set = adjustment.set ?? {};
  return TIER_FIELDS.flatMap(allFields).filter((field) => set[field] !== undefined);
}

/** The tiers whose weight, scheme or record a row touches. */
function tiersOf(fields: AdjustableField[]): Tier[] {
  return TIER_FIELDS.filter((t) => allFields(t).some((field) => fields.includes(field))).map(
    (t) => t.tier
  );
}

interface Replayed {
  adjustment: LiftAdjustment;
  at: Date;
  fields: AdjustableField[];
  /** The lift as it stood just before the adjustment was applied. */
  stateBefore: LiftState;
  /** The values of `fields` in `stateBefore`: what the adjustment replaced. */
  before: Values;
  /** True while nothing later has built on it: see `replayAdjustments`. */
  inForce: boolean;
}

/**
 * Every live adjustment, oldest first, with the values it replaced.
 *
 * The rebuild applies an adjustment before the first finished workout that started at
 * or after it, so the value it replaced is the lift's state after the workout before
 * that one (`snapshots`) with any adjustments in between laid on top. This walks the
 * same order with the same rule ("an adjustment sets the fields it lists; nothing else
 * moves") and reads the state as it goes.
 *
 * An adjustment is still in force when no later adjustment has set any of the same
 * fields and no live workout started since has a logged set of the lift at a tier it
 * touched. Until then a second adjustment holding the earlier values puts the lift
 * back exactly; afterwards it would throw away what was built on top.
 */
function replayAdjustments(log: Log): Replayed[] {
  const live = log.adjustments
    .filter((adjustment) => isLive(adjustment) && Number.isFinite(toMs(adjustment.at)))
    .sort((a, b) => toMs(a.at) - toMs(b.at) || compareIds(a.id, b.id));
  const workoutById = new Map(log.workouts.map((workout) => [workout.id, workout]));

  const states = new Map<string, LiftState>();
  const stateOf = (exerciseId: string) => states.get(exerciseId) ?? emptyLiftState(exerciseId);
  const replayed: Replayed[] = [];
  let next = 0;

  const apply = (adjustment: LiftAdjustment) => {
    const state = stateOf(adjustment.exerciseId);
    const fields = fieldsOf(adjustment);
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = { ...state };
    for (const field of fields) {
      before[field] = state[field];
      after[field] = adjustment.set[field];
    }
    states.set(adjustment.exerciseId, after as unknown as LiftState);
    replayed.push({
      adjustment,
      at: toDate(adjustment.at)!,
      fields,
      stateBefore: state,
      before: before as Values,
      inForce: true,
    });
  };

  // `snapshots` is keyed in the order the rebuild folded the workouts.
  for (const [workoutId, snapshot] of log.rebuild.snapshots) {
    const startedAt = toMs(workoutById.get(workoutId)?.startedAt);
    while (next < live.length && toMs(live[next].at) <= startedAt) apply(live[next++]);
    for (const state of snapshot) states.set(state.exerciseId, state);
  }
  while (next < live.length) apply(live[next++]);

  const liveWorkouts = log.workouts.filter(isLive);
  replayed.forEach((row, index) => {
    const { adjustment, fields } = row;
    const setAgain = replayed
      .slice(index + 1)
      .some(
        (later) =>
          later.adjustment.exerciseId === adjustment.exerciseId &&
          later.fields.some((field) => fields.includes(field))
      );
    row.inForce = !setAgain && !trainedSince(liveWorkouts, adjustment, tiersOf(fields));
  });
  return replayed;
}

/** Whether a live workout started at or after the adjustment has a set of the lift at one of the tiers. */
function trainedSince(workouts: WorkoutSession[], adjustment: LiftAdjustment, tiers: Tier[]): boolean {
  const since = toMs(adjustment.at);
  return workouts.some(
    (workout) =>
      toMs(workout.startedAt) >= since &&
      (workout.sets ?? []).some(
        (set) => set.exerciseId === adjustment.exerciseId && tiers.includes(set.tier)
      )
  );
}

/** Whether a second adjustment can cleanly take this one back. */
function canUndo(row: Replayed): boolean {
  return (
    UNDOABLE.has(row.adjustment.source) &&
    row.inForce &&
    row.fields.some((field) => row.before[field] !== row.adjustment.set[field])
  );
}

/**
 * The adjustment that undoes the one with this id: the same fields set back to the
 * values it replaced. Null when the log's entry for it offers no undo: it is not a
 * change by hand or a time-off reduction, it changed nothing, or something later was
 * built on it (a later adjustment of the same fields, or a workout of the lift at
 * that tier). Hand the result to `recordAdjustment`, dated now.
 */
export function undoAdjustment(log: Log, adjustmentId: string): AdjustmentUndo | null {
  const row = replayAdjustments(log).find((candidate) => candidate.adjustment.id === adjustmentId);
  if (!row || !canUndo(row)) return null;
  return {
    exerciseId: row.adjustment.exerciseId,
    source: "manual",
    set: { ...row.before },
    note: UNDO_NOTE,
  };
}

interface TierChange {
  tier: Tier;
  from: { weight: number; stage?: string };
  to: { weight: number; stage?: string };
}

/** What a row did to each tier whose weight or scheme it set. */
function tierChanges(row: Replayed): TierChange[] {
  const { set } = row.adjustment;
  const state = row.stateBefore;
  const changes: TierChange[] = [];
  for (const t of TIER_FIELDS) {
    const setsWeight = row.fields.includes(t.weight);
    const setsStage = !!t.stage && row.fields.includes(t.stage);
    if (!setsWeight && !setsStage) continue;
    const fromStage = t.stage ? (state[t.stage] as string) : undefined;
    changes.push({
      tier: t.tier,
      from: { weight: state[t.weight] as number, stage: fromStage },
      to: {
        weight: setsWeight ? (set[t.weight] as number) : (state[t.weight] as number),
        stage: setsStage && t.stage ? (set[t.stage] as string) : fromStage,
      },
    });
  }
  return changes;
}

interface ShownChange {
  from: string;
  to: string;
  /** What follows the pair in a title: " at 100" when only the scheme moved. */
  suffix: string;
  showsScheme: boolean;
}

/**
 * The before and after of one tier, as short as it can be said: the weights when only
 * the weight moved, the schemes "at" the weight when only the scheme did, both when
 * both did. Null when nothing moved or there was no earlier weight to show.
 */
function changeOf(change: TierChange): ShownChange | null {
  const { from, to } = change;
  const weightMoved = from.weight !== to.weight;
  const schemeMoved = from.stage !== to.stage;
  if (from.weight === 0 || (!weightMoved && !schemeMoved)) return null;
  if (!schemeMoved) {
    return { from: lbs(from.weight), to: lbs(to.weight), suffix: "", showsScheme: false };
  }
  if (!weightMoved) {
    return {
      from: scheme(from.stage),
      to: scheme(to.stage),
      suffix: ` at ${lbs(to.weight)}`,
      showsScheme: true,
    };
  }
  return {
    from: `${lbs(from.weight)} at ${scheme(from.stage)}`,
    to: `${lbs(to.weight)} at ${scheme(to.stage)}`,
    suffix: "",
    showsScheme: true,
  };
}

/** Title and before/after for a row that is not a starting weight. */
function describeRow(row: Replayed): Pick<AdjustmentEntry, "title" | "change"> & { lead: string } {
  const name = liftLabel(row.adjustment.exerciseId);
  const changes = tierChanges(row);

  if (changes.length === 0) return { title: `${name} progression record changed`, lead: "" };
  if (changes.length > 1) {
    const parts = changes.map((change) => {
      const shown = changeOf(change);
      return shown
        ? `${change.tier} ${shown.from} → ${shown.to}${shown.suffix}`
        : `${change.tier} set to ${lbs(change.to.weight)}`;
    });
    return { title: `${name} weights changed`, lead: `${parts.join(", ")}. ` };
  }

  const [change] = changes;
  const tagged = `${name}${tierTag(change.tier)}`;
  const shown = changeOf(change);
  if (!shown) return { title: `${tagged} set to ${lbs(change.to.weight)}`, lead: "" };
  // A scheme names its tier (5×3 is T1, 3×10 is T2), so the tier is spelt out only without one.
  const subject = shown.showsScheme ? name : tagged;
  return {
    title: `${subject} ${shown.from} → ${shown.to}${shown.suffix}`,
    change: { from: shown.from, to: shown.to },
    lead: "",
  };
}

/**
 * Id prefix of the entry for starting weights. Those rows are dated 1970-01-01 in the
 * data, so the entry's date means nothing; screens use `isStartEntry` to say so.
 */
export const START_ENTRY_ID_PREFIX = "liftAdjustment:start:";

/** Whether `entry` is the starting-weights entry, whose date is a placeholder. */
export function isStartEntry(entry: Pick<AdjustmentEntry, "id">): boolean {
  return entry.id.startsWith(START_ENTRY_ID_PREFIX);
}

/** Starting weights set at the same moment, as one entry. */
function startEntry(rows: Replayed[]): AdjustmentEntry {
  const order = (exerciseId: string) => {
    const index = (MAIN_LIFTS as readonly string[]).indexOf(exerciseId);
    return index === -1 ? MAIN_LIFTS.length : index;
  };
  const heavy = rows
    .filter((row) => (row.adjustment.set.t1Weight ?? 0) > 0)
    .sort(
      (a, b) =>
        order(a.adjustment.exerciseId) - order(b.adjustment.exerciseId) ||
        compareIds(a.adjustment.exerciseId, b.adjustment.exerciseId)
    )
    .map((row) => `${liftShort(row.adjustment.exerciseId)} ${lbs(row.adjustment.set.t1Weight!)}`);
  const what =
    heavy.length > 0
      ? `Heavy sets start at ${joinList(heavy)}.`
      : `Starting weights for ${joinList(rows.map((row) => liftShort(row.adjustment.exerciseId)))}.`;
  return {
    id: `${START_ENTRY_ID_PREFIX}${rows[0].at.getTime()}`,
    at: rows[0].at,
    source: "liftAdjustment",
    title: "Starting weights set",
    detail: `${what} Every later change in this log builds on these.`,
    href: FEED_HREFS.progress,
  };
}

/**
 * One entry per live adjustment, except that starting weights set at the same moment
 * share one. A title shows the value the adjustment replaced and the new one. A
 * reduction after time off cites the time-off rule; a change by hand cites nothing.
 * `undo` is set only for a change by hand or a time-off reduction that a second
 * adjustment can still cleanly take back (`undoAdjustment` builds it).
 */
export function liftAdjustmentEntries(log: Log): RankedEntry[] {
  const out: RankedEntry[] = [];
  const starts = new Map<number, Replayed[]>();

  replayAdjustments(log).forEach((row, index) => {
    const { adjustment } = row;
    if (adjustment.source === "start") {
      const group = starts.get(row.at.getTime());
      if (group) group.push(row);
      else starts.set(row.at.getTime(), [row]);
      return;
    }
    const { lead, ...text } = describeRow(row);
    const reason = SOURCE_REASON[adjustment.source] ?? SOURCE_REASON.manual;
    // A note the row carries ("Undo of an earlier change") is its own last sentence.
    const note = adjustment.note?.trim().replace(/[.!?]$/, "");
    const href = liftHref(adjustment.exerciseId);
    const undo: AdjustmentEntry["undo"] = { kind: "liftAdjustment", adjustmentId: adjustment.id };
    out.push({
      rank: SOURCE_RANK.liftAdjustment + 1 + index,
      entry: {
        id: `liftAdjustment:${adjustment.id}`,
        at: row.at,
        source: "liftAdjustment",
        ...text,
        detail: `${lead}${reason}${note ? ` ${note}.` : ""}`,
        ...(adjustment.source === "decay" ? { ruleId: TIME_OFF_RULE } : {}),
        ...(href ? { href } : {}),
        ...(canUndo(row) ? { undo } : {}),
      },
    });
  });

  for (const rows of starts.values()) {
    out.push({ rank: SOURCE_RANK.liftAdjustment, entry: startEntry(rows) });
  }
  return out;
}
