// What the full view of one coming workout says: its words, its rows and where its
// button goes. Pure; no React. The plan itself comes from `describeUpcomingWorkout`.
import { EXERCISES } from "@/lib/exercises";
import type { SessionMinutes } from "@/lib/accessories/sessionBudget";
import { upcomingWorkoutHref } from "@/lib/routes";
import { workoutDisplayName } from "@/lib/workoutNames";
import {
  MAX_UPCOMING_POSITION,
  plannedSetsOf,
  type UpcomingLift,
  type UpcomingWorkoutDetail,
} from "@/lib/workout/upcoming";
import type { WorkoutPlan } from "@/lib/workout/types";
import type { PlannedSet, Tier, WorkoutLocation, WorkoutSession } from "@/types";
import { buildLiftRows, type TodayLiftRow } from "@/components/Today/LiftRows";
import { formatLbs } from "@/components/Today/format";
import { displayLiftName, liftReason, type LiftReason } from "@/components/Today/todayModel";

/** `?n=`: a whole number from 0 to the furthest position planned; null for anything else. */
export function parsePosition(raw: string | null | undefined): number | null {
  if (raw == null || !/^\d{1,2}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= MAX_UPCOMING_POSITION ? n : null;
}

/** `?location=`: "gym" or "home"; null for anything else. */
export function parseLocation(raw: string | null | undefined): WorkoutLocation | null {
  return raw === "gym" || raw === "home" ? raw : null;
}

const ORDINAL = ["1st", "2nd", "3rd"];

/** "Next · A1", "3rd up · A2": the place in the sequence, deliberately not a date. */
export function positionLabel(position: number, templateId: string): string {
  if (position === 0) return `Next · ${templateId}`;
  const place = ORDINAL[position] ?? `${position + 1}th`;
  return `${place} up · ${templateId}`;
}

/** "About 58 of 60 min" against the length planned for, "About 58 min" without one. */
export function lengthLine(minutes: number | null, target: SessionMinutes | undefined): string | null {
  if (minutes === null) return null;
  return target == null ? `About ${minutes} min` : `About ${minutes} of ${target} min`;
}

/** "Squat day (A1)". */
export function dayLabel(templateId: string): string {
  return `${workoutDisplayName(templateId)} (${templateId})`;
}

/**
 * What a later workout's lift assumes, in plain words, naming the day it depends on:
 * "Assumes you complete every set on Squat day (A1) before this." Null for the next
 * workout, which assumes nothing.
 */
export function assumptionLine(lift: UpcomingLift, position: number): string | null {
  if (position === 0) return null;
  if (lift.dependsOn) return `Assumes you complete every set on ${dayLabel(lift.dependsOn.templateId)} before this.`;
  return "No day before this one changes it.";
}

/**
 * The lift rows. The next workout's are exactly Today's (`buildLiftRows`, reasons from
 * the finished workouts). A later one's lift that depends on an earlier day says how it
 * moved from that day's weight; one that does not, how it compares with last time.
 */
export function upcomingLiftRows(
  detail: UpcomingWorkoutDetail,
  finishedNewestFirst: Pick<WorkoutSession, "completedAt" | "sets" | "prescribed">[]
): TodayLiftRow[] {
  const entries = detail.lifts.map((lift) => lift.entry);
  if (!detail.projected) return buildLiftRows(entries, finishedNewestFirst);
  return detail.lifts.map((lift) => {
    const { entry } = lift;
    const last = lift.dependsOn
      ? [...lift.changes].reverse().find((c) => c.position === lift.dependsOn!.position)
      : undefined;
    let reason: LiftReason;
    if (last && entry.weight !== last.from.weight) {
      reason = {
        kind: entry.weight > last.from.weight ? "up" : "down",
        change: Math.abs(entry.weight - last.from.weight),
        from: last.from.weight,
      };
    } else if (last) {
      reason = { kind: "held", weight: entry.weight };
    } else {
      reason = liftReason(entry, finishedNewestFirst);
    }
    return { entry, name: displayLiftName(entry.substituteExerciseId ?? entry.exerciseId), reason };
  });
}

/** One block of the set-by-set list: a lift or an accessory with its warm-ups and sets. */
export interface SetBlock {
  key: string;
  exerciseId: string;
  /** The exercise performed: the home exercise at home. */
  shownId: string;
  tier: Tier;
  warmUps: PlannedSet[];
  sets: PlannedSet[];
  /** The last set asks for as many reps as you can. */
  isAMRAP: boolean;
  perHand: boolean;
  /** No weight is a bodyweight set; for anything else it is a weight still to choose. */
  bodyweight: boolean;
}

/** Every entry of the plan in order, each lift with the warm-ups that lead to it. */
export function setBlocks(plan: WorkoutPlan): SetBlock[] {
  const blocks: SetBlock[] = [];
  let warmUps: PlannedSet[] = [];
  for (const entry of plan) {
    if (entry.isWarmUp) {
      warmUps.push(...plannedSetsOf(entry));
      continue;
    }
    const shownId = entry.substituteExerciseId ?? entry.exerciseId;
    blocks.push({
      key: `${entry.tier}-${entry.exerciseId}`,
      exerciseId: entry.exerciseId,
      shownId,
      tier: entry.tier,
      warmUps,
      sets: plannedSetsOf(entry),
      isAMRAP: entry.isAMRAP,
      perHand: entry.perHand ?? EXERCISES[shownId]?.grip === "per_hand",
      bodyweight: EXERCISES[shownId]?.type === "bodyweight",
    });
    warmUps = [];
  }
  return blocks;
}

/** "190×3", "BW×10" for a bodyweight set, "—×15" when the weight is still to choose. */
export function setText(set: PlannedSet, last = false, amrap = false, bodyweight = false): string {
  const weight = set.weight > 0 ? formatLbs(set.weight) : bodyweight ? "BW" : "—";
  return `${weight}×${set.reps}${last && amrap ? "+" : ""}`;
}

/** The main button: where it goes, what it says, and the line under it. */
export interface StartAction {
  label: string;
  href: string;
  note: string | null;
}

/**
 * The next workout starts as Today does. A later one is done today on the Ready screen
 * at this location; the rotation does not move, so the due day stays next. When the
 * days before it moved its lifts, it says the Ready screen plans from where they are now.
 */
export function startAction(detail: UpcomingWorkoutDetail): StartAction {
  const { templateId, location, dueTemplateId } = detail;
  if (!detail.projected || templateId === dueTemplateId) {
    return {
      label: "Start",
      href: `/workout/configure?location=${location}`,
      note: detail.projected ? "This day is due now. Started today, it uses where your lifts are now." : null,
    };
  }
  const due = `${workoutDisplayName(dueTemplateId)} stays next.`;
  return {
    label: "Do this one today",
    href: `/workout/configure?templateId=${templateId}&location=${location}`,
    note: detail.sameIfDoneToday ? due : `${due} Done today, it starts from where your lifts are now.`,
  };
}

/** One thing that would change the plan, with a link where there is one. */
export interface ChangeItem {
  key: "missed" | "skipped" | "location";
  text: string;
  href?: string;
}

/** "What would change this": a missed set, a skipped day, the other location. */
export function whatWouldChange(detail: UpcomingWorkoutDetail, from?: "today" | null): ChangeItem[] {
  const other: WorkoutLocation = detail.location === "gym" ? "home" : "gym";
  return [
    {
      key: "missed",
      text: detail.projected
        ? "A missed set before this: that lift holds or drops a stage, so it is lighter here."
        : "A missed set today: that lift holds or drops a stage, and the days after this change.",
    },
    {
      key: "skipped",
      text: detail.projected
        ? "A skipped day: the rotation waits for it, so this day comes later."
        : "A skipped day: the rotation waits, so this stays the next workout.",
    },
    {
      key: "location",
      text:
        other === "home"
          ? "Home instead: dumbbell versions at their own weights."
          : "The gym instead: the barbell lifts at their own weights.",
      href: upcomingWorkoutHref(detail.position, other, from),
    },
  ];
}
