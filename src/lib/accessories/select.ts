// Which accessories a workout gets (A3): a scored, ranked list with the reasons for
// each, so the app can choose them by default and say why. Pure and deterministic:
// the same input gives the same output; the clock is `now`.
// Spec: docs/plans/2026-11-17-accessories-design.md (decision 2, parts a to g).
import { getAccessoryRepRange, getPhaseAccessoryCap } from "@/lib/accessories";
import { getPreference, resolvePreferences } from "@/lib/exercisePreferences";
import { ACCESSORY_IDS, EXERCISES, HOME_SUBSTITUTE_CHAINS } from "@/lib/exercises";
import { loadFromSetCounts, type MuscleValues } from "@/lib/muscleLoad";
import { MUSCLE_LABELS } from "@/lib/muscles";
import { STRENGTH_POOLING, type StrengthSet } from "@/lib/strength";
import { ACCESSORY_RECOMMENDATIONS, HOME_ACCESSORY_ALTERNATIVES } from "@/lib/workoutTemplates";
import type {
  EquipmentProfile,
  ExercisePreferences,
  LocationExercisePreferences,
  MuscleId,
  RecoveryStatus,
  TrainingPhase,
  WorkoutLocation,
} from "@/types";

// ─── Score weights (heuristic: judgment, not research; rule accessory-selection) ─
// Ordered as decision 2 orders them: pinned > preferred > habit > shortfall > day fit
// > recovery > spread. Each part is at most its weight.

/** a. Pinned to this day: always in, ahead of everything (also added to the score). */
export const ACCESSORY_PIN_SCORE = 1000;
/** b. Marked preferred (overall or at this location). */
export const ACCESSORY_PREFERRED_WEIGHT = 40;
/** c. Habit: at most this much for an exercise done often and lately. */
export const ACCESSORY_HABIT_WEIGHT = 30;
/** Recency-weighted sessions at which habit reaches half its weight. */
export const ACCESSORY_HABIT_HALF_SESSIONS = 1;
/** Share of habit that depends on the exercise having been done on this kind of day. */
export const ACCESSORY_HABIT_DAY_SHARE = 0.5;
/** d. This week's shortfall: at most this much for a muscle well under the target. */
export const ACCESSORY_SHORTFALL_WEIGHT = 20;
/** Sets short at which the shortfall part is full. */
export const ACCESSORY_SHORTFALL_FULL_SETS = 6;
/**
 * The weekly set target per muscle the shortfall is measured against: the volume
 * chart's 10 sets (rule weekly-volume).
 */
export const WEEKLY_SET_TARGET = 10;
/** e. Fit with the day: at most this much for muscles today's main lifts leave alone. */
export const ACCESSORY_DAY_FIT_WEIGHT = 12;
/** Sets of today's main lifts on a muscle at which it counts as worked hard. */
export const ACCESSORY_DAY_HARD_SETS = 3;
/** f. Recovery: taken off when a primary muscle is still recovering. */
export const ACCESSORY_RECOVERY_PENALTY = 8;
/** g. Spread: taken off when a pick already has the same primary muscle (unless it is short). */
export const ACCESSORY_SPREAD_PENALTY = 6;

/**
 * Muscles the shortfall does not chase: they are worked by most lifts as helpers and
 * have no accessory of their own in the library, so a gap there says little.
 */
const SHORTFALL_IGNORED: ReadonlySet<MuscleId> = new Set([
  "rotator_cuff",
  "forearms",
  "upper_traps",
  "obliques",
  "adductors",
]);

/** Exercises that need a bench (left out at home when the equipment has none; swaps too). */
export const NEEDS_BENCH: ReadonlySet<string> = new Set([
  "incline_db_fly",
  "db_fly",
  "incline_db_press",
  "incline_db_curl",
  "incline_hammer_curl",
  "db_pullover",
  "db_skull_crushers",
  "seated_db_shoulder_press",
  "seated_lateral_raises",
  "hip_thrust",
]);

const DAY_MS = 86_400_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AccessoryScoreParts {
  pinned: number;
  preferred: number;
  habit: number;
  shortfall: number;
  dayFit: number;
  recovery: number;
  spread: number;
}

export interface AccessoryCandidate {
  exerciseId: string;
  score: number;
  parts: AccessoryScoreParts;
  /** Short plain sentences for the row, most important first. */
  reasons: string[];
}

export interface ChooseAccessoriesInput {
  /** The day's template id (A1, B1, A2, B2). */
  templateId: string;
  /** The day's T1 to T3 as planned: the exercise done (the home exercise at home) and its sets. */
  mainLifts: readonly { exerciseId: string; sets: number }[];
  location: WorkoutLocation;
  /** At home, exercises that need a bench are left out when `hasBench` is false. */
  equipment?: Pick<EquipmentProfile, "hasBench">;
  phase: TrainingPhase;
  preferences?: ExercisePreferences;
  preferencesByLocation?: LocationExercisePreferences;
  /** This day's pins (`accessoryPinsFor(settings, templateId)`), in order. */
  pins?: readonly string[];
  /**
   * The lifter's strength sets, app and imported (`strengthEvidenceOf`). Habit reads the
   * accessory-capable exercises; sets of the main lifts in the same session say which
   * kind of day an accessory was done on.
   */
  history: readonly StrengthSet[];
  /** This week's sets per muscle so far, counted as the Muscles tab counts them (primary 1, secondary 0.5, imported included). */
  weekSetsSoFar: MuscleValues;
  /** Recovery status per muscle (`recoveryFromLastTrained`). */
  recovery?: Partial<Record<MuscleId, RecoveryStatus>>;
  now: Date;
}

export interface ChooseAccessoriesResult {
  /** The accessories chosen: every pin in order, then the best of the rest up to the phase's cap. */
  picks: AccessoryCandidate[];
  /** Everything else that can be done today, best first. */
  others: AccessoryCandidate[];
  /** The phase's cap (`getPhaseAccessoryCap`). */
  cap: number;
  /** True when there was no accessory history and the day's fixed list was used. */
  fromDayList: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SINGULAR: ReadonlySet<MuscleId> = new Set(["chest", "mid_back", "lower_back", "rotator_cuff"]);

/** "Side delts", "Chest". */
function muscleName(m: MuscleId): string {
  const label = MUSCLE_LABELS[m];
  return label.charAt(0) + label.slice(1).toLowerCase();
}
const isAre = (m: MuscleId) => (SINGULAR.has(m) ? "is" : "are");
const listOf = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
const setsText = (n: number) => `${n} ${n === 1 ? "set" : "sets"}`;

/** The program lift an exercise is or stands in for, else the exercise itself. */
function programLiftOf(exerciseId: string): string {
  const exercise = EXERCISES[exerciseId];
  if (exercise?.barbellEquivalent) return exercise.barbellEquivalent;
  for (const [lift, chain] of Object.entries(HOME_SUBSTITUTE_CHAINS)) if (chain.includes(exerciseId)) return lift;
  return exerciseId;
}

const DAY_NAMES: Record<string, string> = { squat: "squat", bench: "bench", deadlift: "deadlift", ohp: "press" };

const time = (d: Date | string) => new Date(d).getTime();

interface Habit {
  /** Recency-weighted sessions (each halved per STRENGTH_POOLING.evidenceHalfLifeDays of age). */
  weighted: number;
  /** The share of `weighted` from sessions that also had today's T1 lift. */
  dayShare: number;
  /** Sessions in the last four weeks. */
  recentSessions: number;
}

/** Habit per exercise from the history, and whether there is any accessory history at all. */
function habits(
  history: readonly StrengthSet[],
  dayLift: string | null,
  now: number,
  candidates: ReadonlySet<string>
): { byExercise: Map<string, Habit>; any: boolean } {
  const sessions = new Map<string, { exercises: Set<string>; lifts: Set<string>; at: number }>();
  for (const set of history) {
    if (set.role === "warmup" || set.provisional) continue;
    const at = time(set.date);
    if (!Number.isFinite(at) || at > now) continue;
    const session = sessions.get(set.sessionId) ?? { exercises: new Set<string>(), lifts: new Set<string>(), at };
    session.exercises.add(set.exerciseId);
    session.lifts.add(programLiftOf(set.exerciseId));
    session.at = Math.max(session.at, at);
    sessions.set(set.sessionId, session);
  }
  const byExercise = new Map<string, Habit>();
  const halfLife = STRENGTH_POOLING.evidenceHalfLifeDays * DAY_MS;
  let any = false;
  const ordered = [...sessions.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [, session] of ordered) {
    const w = Math.pow(0.5, (now - session.at) / halfLife);
    const onDay = dayLift !== null && session.lifts.has(dayLift);
    for (const id of session.exercises) {
      if (!candidates.has(id)) continue;
      any = true;
      const h = byExercise.get(id) ?? { weighted: 0, dayShare: 0, recentSessions: 0 };
      const day = h.dayShare * h.weighted + (onDay ? w : 0);
      h.weighted += w;
      h.dayShare = h.weighted > 0 ? day / h.weighted : 0;
      if (now - session.at <= 28 * DAY_MS) h.recentSessions += 1;
      byExercise.set(id, h);
    }
  }
  return { byExercise, any };
}

interface Base {
  exerciseId: string;
  pinIndex: number | null;
  preferred: boolean;
  /** The gym-only exercise this stands in for at home. */
  insteadOf: string | null;
  order: number;
}

// ─── chooseAccessories ───────────────────────────────────────────────────────

/**
 * The accessories for a workout, chosen and ranked.
 *
 * Candidates are the library's accessories plus this day's pins. Blocked exercises
 * (at this location) are never offered, nor today's main lifts. At home a gym-only
 * exercise is replaced by its home alternative (which inherits its pin and preference)
 * or left out; exercises that need a bench are left out when there is none.
 *
 * The score (every coefficient a named constant above, graded heuristic):
 * a. pinned: ACCESSORY_PIN_SCORE; pins are always picked, in pin order, even past the cap;
 * b. preferred: ACCESSORY_PREFERRED_WEIGHT;
 * c. habit: ACCESSORY_HABIT_WEIGHT x h / (h + ACCESSORY_HABIT_HALF_SESSIONS), where h
 *    counts the sessions with the exercise, each halved for every
 *    STRENGTH_POOLING.evidenceHalfLifeDays of age; ACCESSORY_HABIT_DAY_SHARE of it
 *    depends on those sessions having had today's T1 lift;
 * d. shortfall: ACCESSORY_SHORTFALL_WEIGHT x (sets short / ACCESSORY_SHORTFALL_FULL_SETS,
 *    at most 1) for its most-short primary muscle, short of WEEKLY_SET_TARGET after this
 *    week's sets so far and the sets today's main lifts will add;
 * e. day fit: ACCESSORY_DAY_FIT_WEIGHT x (1 - today's main-lift sets on its primary
 *    muscles / ACCESSORY_DAY_HARD_SETS, at least 0);
 * f. recovery: minus ACCESSORY_RECOVERY_PENALTY when a primary muscle is recovering;
 * g. spread: minus ACCESSORY_SPREAD_PENALTY when an earlier pick has the same primary
 *    muscle and that muscle is not still short after the picks' sets; such a candidate
 *    is also skipped for a pick while any other is left (pins are never skipped).
 * Picks are taken one at a time, best score first, so spread sees the picks before.
 * Ties go to the library's order.
 *
 * With no accessory history at all, the picks after the pins are the preferred ones
 * and then the day's fixed list (`ACCESSORY_RECOMMENDATIONS`), as before, so a new
 * lifter sees what they saw.
 *
 * @evidence accessory-selection
 */
export function chooseAccessories(input: ChooseAccessoriesInput): ChooseAccessoriesResult {
  const now = input.now.getTime();
  const cap = getPhaseAccessoryCap(input.phase);
  const prefs = resolvePreferences(input.preferences, input.preferencesByLocation, input.location);
  const blocked = (id: string) => getPreference(prefs, id) === "blocked";
  const mainIds = new Set(input.mainLifts.map((l) => l.exerciseId));
  const t1 = input.mainLifts[0]?.exerciseId;
  const dayLift = t1 ? programLiftOf(t1) : null;
  const atHome = input.location === "home";
  const noBench = atHome && input.equipment?.hasBench === false;

  // ── Candidates, with home replacement ──
  const pins = (input.pins ?? []).filter((id) => EXERCISES[id]);
  const pool = [...pins, ...ACCESSORY_IDS.filter((id) => !pins.includes(id))];
  const bases = new Map<string, Base>();
  pool.forEach((original, order) => {
    let id = original;
    let insteadOf: string | null = null;
    if (atHome && EXERCISES[original].requiresGym) {
      const alt = HOME_ACCESSORY_ALTERNATIVES[original];
      if (!alt || !EXERCISES[alt]) return;
      id = alt;
      insteadOf = original;
    }
    if (blocked(original) || blocked(id) || mainIds.has(id)) return;
    if (noBench && NEEDS_BENCH.has(id)) return;
    const pinIndex = pins.indexOf(original);
    const preferred = getPreference(prefs, original) === "preferred" || getPreference(prefs, id) === "preferred";
    const existing = bases.get(id);
    if (existing) {
      if (pinIndex >= 0 && (existing.pinIndex === null || pinIndex < existing.pinIndex)) existing.pinIndex = pinIndex;
      existing.preferred ||= preferred;
      return;
    }
    bases.set(id, { exerciseId: id, pinIndex: pinIndex >= 0 ? pinIndex : null, preferred, insteadOf, order });
  });

  // ── Fixed parts ──
  const todayLoad = loadFromSetCounts([...input.mainLifts]);
  const shortBefore = (m: MuscleId) =>
    SHORTFALL_IGNORED.has(m)
      ? 0
      : Math.max(0, WEEKLY_SET_TARGET - (input.weekSetsSoFar[m] ?? 0) - (todayLoad[m] ?? 0));
  const { byExercise: habitOf, any: hasHistory } = habits(input.history, dayLift, now, new Set(bases.keys()));
  const dayName = dayLift ? (DAY_NAMES[dayLift] ?? null) : null;

  interface Scored {
    base: Base;
    parts: Omit<AccessoryScoreParts, "spread">;
    reasons: string[];
    primaries: MuscleId[];
  }
  const scored: Scored[] = [...bases.values()].map((base) => {
    const exercise = EXERCISES[base.exerciseId];
    const primaries = exercise.primaryMuscles;
    const reasons: string[] = [];
    const pinned = base.pinIndex !== null ? ACCESSORY_PIN_SCORE : 0;
    if (pinned) reasons.push("Always on this day");
    if (base.insteadOf) reasons.push(`At home instead of ${EXERCISES[base.insteadOf].name}`);
    const preferred = base.preferred ? ACCESSORY_PREFERRED_WEIGHT : 0;
    if (preferred) reasons.push("You marked this preferred");

    const h = habitOf.get(base.exerciseId);
    let habit = 0;
    if (h && h.weighted > 0) {
      const strength = h.weighted / (h.weighted + ACCESSORY_HABIT_HALF_SESSIONS);
      habit = ACCESSORY_HABIT_WEIGHT * strength * (1 - ACCESSORY_HABIT_DAY_SHARE + ACCESSORY_HABIT_DAY_SHARE * h.dayShare);
      if (dayName && h.dayShare >= 0.5 && h.weighted >= 1) reasons.push(`You usually do this on ${dayName} days`);
      else if (h.recentSessions > 0) reasons.push(`You did this ${h.recentSessions === 1 ? "once" : `${h.recentSessions} times`} in the last 4 weeks`);
      else reasons.push("You have done this before");
    }

    let worst: MuscleId | null = null;
    for (const m of primaries) if (shortBefore(m) > 0 && (!worst || shortBefore(m) > shortBefore(worst))) worst = m;
    const shortSets = worst ? shortBefore(worst) : 0;
    const shortfall = ACCESSORY_SHORTFALL_WEIGHT * Math.min(1, shortSets / ACCESSORY_SHORTFALL_FULL_SETS);
    if (worst && shortSets >= 1) {
      reasons.push(`${muscleName(worst)} ${isAre(worst)} ${setsText(Math.round(shortSets))} short this week`);
    }

    const overlap = Math.max(0, ...primaries.map((m) => todayLoad[m] ?? 0));
    const dayFit = ACCESSORY_DAY_FIT_WEIGHT * Math.max(0, 1 - overlap / ACCESSORY_DAY_HARD_SETS);
    if (overlap === 0) reasons.push("Today's main lifts do not work it");
    else if (overlap >= ACCESSORY_DAY_HARD_SETS) {
      const m = primaries.find((p) => (todayLoad[p] ?? 0) >= ACCESSORY_DAY_HARD_SETS) ?? primaries[0];
      reasons.push(`Today's main lifts already work the ${muscleName(m).toLowerCase()}`);
    }

    const tired = primaries.find((m) => input.recovery?.[m] === "recovering");
    const recovery = tired ? -ACCESSORY_RECOVERY_PENALTY : 0;
    if (tired) reasons.push(`${muscleName(tired)} ${isAre(tired)} still recovering`);
    if (reasons.length === 0) reasons.push(`Works the ${listOf(primaries.map((m) => muscleName(m).toLowerCase()))}`);

    return { base, parts: { pinned, preferred, habit, shortfall, dayFit, recovery }, reasons, primaries };
  });

  const total = (p: AccessoryScoreParts) =>
    p.pinned + p.preferred + p.habit + p.shortfall + p.dayFit + p.recovery + p.spread;

  // Sets the picks add per primary muscle, for spread.
  const added = new Map<MuscleId, number>();
  const spreadOf = (s: Scored): { penalty: number; muscle: MuscleId | null } => {
    for (const m of s.primaries) {
      const by = added.get(m) ?? 0;
      if (by > 0 && shortBefore(m) - by <= 0) return { penalty: -ACCESSORY_SPREAD_PENALTY, muscle: m };
    }
    return { penalty: 0, muscle: null };
  };
  const candidate = (s: Scored): AccessoryCandidate => {
    const spread = spreadOf(s);
    const parts = { ...s.parts, spread: spread.penalty };
    const reasons = spread.muscle
      ? [...s.reasons, `Another pick already works the ${muscleName(spread.muscle).toLowerCase()}`]
      : s.reasons;
    return { exerciseId: s.base.exerciseId, score: round(total(parts)), parts: roundParts(parts), reasons };
  };
  const better = (a: AccessoryCandidate, sa: Scored, b: AccessoryCandidate, sb: Scored) =>
    b.score - a.score || sa.base.order - sb.base.order;

  const remaining = [...scored];
  const picks: AccessoryCandidate[] = [];
  const take = (s: Scored) => {
    picks.push(candidate(s));
    remaining.splice(remaining.indexOf(s), 1);
    const sets = getAccessoryRepRange(s.base.exerciseId).sets;
    for (const m of s.primaries) added.set(m, (added.get(m) ?? 0) + sets);
  };

  // a. Pins, in pin order.
  for (const s of scored.filter((x) => x.base.pinIndex !== null).sort((a, b) => a.base.pinIndex! - b.base.pinIndex!)) {
    take(s);
  }

  const fromDayList = !hasHistory;
  if (fromDayList) {
    // No history: preferred ones (best first), then the day's fixed list in its order.
    const preferredFirst = remaining
      .filter((s) => s.base.preferred)
      .map((s) => ({ s, c: candidate(s) }))
      .sort((x, y) => better(x.c, x.s, y.c, y.s));
    for (const { s } of preferredFirst) if (picks.length < cap) take(s);
    for (const original of ACCESSORY_RECOMMENDATIONS[input.templateId] ?? []) {
      if (picks.length >= cap) break;
      const id = atHome && EXERCISES[original]?.requiresGym ? HOME_ACCESSORY_ALTERNATIVES[original] : original;
      const s = remaining.find((x) => x.base.exerciseId === id);
      if (s) {
        take(s);
        picks[picks.length - 1].reasons.push("Suggested for this day");
      }
    }
  }
  // The rest by score. Spread is a rule here as well as a part: a pick that repeats a
  // primary muscle that is not short is taken only when nothing else is left.
  while (picks.length < cap && remaining.length > 0) {
    const ranked = remaining.map((s) => ({ s, c: candidate(s) })).sort((x, y) => better(x.c, x.s, y.c, y.s));
    take((ranked.find((x) => x.c.parts.spread === 0) ?? ranked[0]).s);
  }

  const others = remaining
    .map((s) => ({ s, c: candidate(s) }))
    .sort((x, y) => better(x.c, x.s, y.c, y.s))
    .map((x) => x.c);
  return { picks, others, cap, fromDayList };
}

const round = (n: number) => Math.round(n * 100) / 100;
function roundParts(p: AccessoryScoreParts): AccessoryScoreParts {
  return {
    pinned: round(p.pinned),
    preferred: round(p.preferred),
    habit: round(p.habit),
    shortfall: round(p.shortfall),
    dayFit: round(p.dayFit),
    recovery: round(p.recovery),
    spread: round(p.spread),
  };
}
