// What one finished session did to each of its program lifts, read from the lift states
// the rebuild recorded as of that session. Pure: no React, no database.
import { formatLbs } from "@/components/LogEdit/format";
import { hasFreezeStatus, T3_LAST_SET_INCREASE_REPS, T3_TOTAL_INCREASE_REPS } from "@/lib/progression";
import { T1_STAGE_SCHEME, T2_STAGE_SCHEME } from "@/lib/workout/prescription";
import { workingSetsFor } from "@/lib/workout/setSelectors";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { LiftState, SetLog, T1Stage, T2Stage, WorkoutSession } from "@/types";

export type ProgramTier = "T1" | "T2" | "T3";

export type OutcomeKind =
  | "passed"
  | "missed"
  | "reset"
  | "held"
  | "partial"
  | "notDone"
  | "unchanged"
  | "t3Up"
  | "t3Same";

export interface LiftOutcome {
  exerciseId: string;
  tier: ProgramTier;
  kind: OutcomeKind;
  /** The full line, e.g. "passed: next 195 lbs 5x3". */
  text: string;
}

interface Prescribed {
  weight: number;
  stage: T1Stage | T2Stage | null;
}

const T1_STAGES = Object.keys(T1_STAGE_SCHEME) as T1Stage[];
const T2_STAGES = Object.keys(T2_STAGE_SCHEME) as T2Stage[];

function tierState(state: LiftState | undefined, tier: ProgramTier): Prescribed | null {
  if (!state) return null;
  if (tier === "T1") return { weight: state.t1Weight, stage: state.t1Stage };
  if (tier === "T2") return { weight: state.t2Weight, stage: state.t2Stage };
  return { weight: state.t3Weight, stage: null };
}

/** What the session was given: its stored prescription, else the state before it. */
function prescribedFor(
  session: WorkoutSession,
  exerciseId: string,
  tier: ProgramTier,
  before: LiftState | undefined
): Prescribed | null {
  const entry = session.prescribed?.find((p) => p.exerciseId === exerciseId && p.tier === tier);
  const fallback = tierState(before, tier);
  if (entry) return { weight: entry.weight, stage: entry.stage ?? fallback?.stage ?? null };
  return fallback;
}

function setsFor(tier: ProgramTier, stage: T1Stage | T2Stage | null, templateSets: number): number {
  if (tier === "T1" && stage && stage in T1_STAGE_SCHEME) return T1_STAGE_SCHEME[stage as T1Stage].sets;
  if (tier === "T2" && stage && stage in T2_STAGE_SCHEME) return T2_STAGE_SCHEME[stage as T2Stage].sets;
  return templateSets;
}

const lbs = (weight: number) => `${formatLbs(weight)} lbs`;

/** Pain, a recent run, equipment limits or an accepted T2 load drop hold progression. */
const held = (sets: SetLog[]) =>
  hasFreezeStatus(sets) || sets.some((s) => s.status === "autoregulated_load_drop");

/**
 * One outcome per T1, T2 and T3 lift of the session's template.
 *
 * `after` is the lift states right after the session (the rebuild's snapshot for it);
 * `before` is the snapshot of the session before it, used only when the session has no
 * stored prescription. Returns nothing when `after` is missing (the workout is not
 * finished or not in the log).
 */
export function describeOutcomes(
  session: WorkoutSession,
  after: LiftState[] | undefined,
  before: LiftState[] | undefined
): LiftOutcome[] {
  const template = WORKOUT_TEMPLATES[session.templateId];
  if (!template || !after) return [];
  const afterById = new Map(after.map((s) => [s.exerciseId, s]));
  const beforeById = new Map((before ?? []).map((s) => [s.exerciseId, s]));

  const outcomes: LiftOutcome[] = [];
  for (const ex of template.exercises) {
    if (ex.tier !== "T1" && ex.tier !== "T2" && ex.tier !== "T3") continue;
    const tier = ex.tier;
    const given = prescribedFor(session, ex.exerciseId, tier, beforeById.get(ex.exerciseId));
    const next = tierState(afterById.get(ex.exerciseId), tier);
    if (!given || !next) continue;

    const sets = workingSetsFor(session.sets ?? [], ex.exerciseId, tier);
    const outcome = (kind: OutcomeKind, text: string) =>
      outcomes.push({ exerciseId: ex.exerciseId, tier, kind, text });
    const stillThere = (verb: string) =>
      tier === "T3" ? `${verb}: stays at ${lbs(next.weight)}` : `${verb}: no change`;

    if (sets.length === 0) {
      outcome("notDone", stillThere("not done"));
      continue;
    }

    if (tier === "T3") {
      if (next.weight > given.weight) {
        const lastSet = sets[sets.length - 1].actualReps;
        const reason =
          lastSet >= T3_LAST_SET_INCREASE_REPS
            ? `last set reached ${T3_LAST_SET_INCREASE_REPS}`
            : `sets totalled ${T3_TOTAL_INCREASE_REPS}+ reps`;
        outcome("t3Up", `${reason}: next ${lbs(next.weight)}`);
      } else if (held(sets)) {
        outcome("held", stillThere("held"));
      } else if (sets.length < ex.sets) {
        outcome("partial", stillThere("partly done"));
      } else {
        const lastSet = sets[sets.length - 1].actualReps;
        outcome(
          "t3Same",
          `stays at ${lbs(next.weight)} (last set ${lastSet} of ${T3_LAST_SET_INCREASE_REPS} reps)`
        );
      }
      continue;
    }

    const stages: string[] = tier === "T1" ? T1_STAGES : T2_STAGES;
    if (next.stage !== given.stage) {
      const wasLast = given.stage === stages[stages.length - 1] && next.stage === stages[0];
      if (wasLast) outcome("reset", `missed: resets to ${lbs(next.weight)} ${next.stage}`);
      else outcome("missed", `missed: moves to ${next.stage} at ${lbs(next.weight)}`);
    } else if (next.weight > given.weight) {
      outcome("passed", `passed: next ${lbs(next.weight)} ${next.stage}`);
    } else if (held(sets)) {
      outcome("held", stillThere("held"));
    } else if (sets.length < setsFor(tier, given.stage, ex.sets)) {
      outcome("partial", stillThere("partly done"));
    } else {
      outcome("unchanged", `no change: next ${lbs(next.weight)} ${next.stage}`);
    }
  }
  return outcomes;
}
