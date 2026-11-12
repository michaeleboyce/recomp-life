// Plain-language definitions for the words and abbreviations the app uses.
// Numbers come from the constants that drive the app, so the text cannot drift.
import { T1_AMRAP_TARGET_RPE } from "@/lib/amrap";
import { generateDeloadPrescription } from "@/lib/deload";
import { E1RM_MAX_REPS, E1RM_MAX_REPS_IN_RESERVE } from "@/lib/e1rm";
import type { RuleId } from "@/lib/evidence";
import { RESET_FACTOR, T2_AUTOREG_DROP, T2_AUTOREG_RPE_THRESHOLD } from "@/lib/progression";
import { PR_CHANCE_RECENT_SETS, PR_STRETCH_MAX_REPS_ABOVE } from "@/lib/projection/prOpportunity";
import { STALL_BAND_PERCENT } from "@/lib/rateOfLoss";
import { CUTTING_REST_BONUS_SECONDS, REST_SECONDS } from "@/lib/restTimes";
import { T1_STAGE_SCHEME, T2_STAGE_SCHEME } from "@/lib/workout/prescription";
import { WORKOUT_ROTATION } from "@/lib/workoutTemplates";

export type TermId =
  | "gzclp" | "t1" | "t2" | "t3" | "rotation" | "sets-reps" | "amrap-plus" | "stage"
  | "fail-reset" | "freeze" | "working-weight" | "warm-up" | "accessory" | "substitute"
  | "gym-debt" | "rest-timer" | "deload"
  | "amrap" | "rpe" | "rir" | "hard-set" | "autoregulation"
  | "e1rm" | "pr" | "pr-chance" | "projection" | "weekly-sets"
  | "training-phase" | "rate-of-loss";

export interface GlossaryEntry {
  term: string;
  aka?: string[];
  /** One plain sentence, under 140 characters, for the popover. */
  short: string;
  /** Two to four sentences. */
  long: string;
  ruleId?: RuleId;
  seeAlso?: TermId[];
}

export type GlossaryTheme = "Program" | "Effort" | "Progress" | "Body";

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;
const resetPct = pct(RESET_FACTOR);
const stages = (scheme: Record<string, unknown>) => Object.keys(scheme).join(", then ");
const t1Stages = stages(T1_STAGE_SCHEME);
const t2Stages = stages(T2_STAGE_SCHEME);
/** 180 -> "3 minutes", 90 -> "90 seconds". */
function duration(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60} minutes` : `${seconds} seconds`;
}
const deloadCut = generateDeloadPrescription({ mode: "cutting" }).weightReductionPercent;
const deloadOther = generateDeloadPrescription({ mode: "maintaining" }).weightReductionPercent;

export const GLOSSARY: Record<TermId, GlossaryEntry> = {
  gzclp: {
    term: "GZCLP",
    short: "The training program this app runs: heavy, moderate and light lifts each workout, adding weight whenever you succeed.",
    long: `GZCLP is a beginner-friendly strength program by Cody Lefever. Every workout has one heavy lift (T1), one moderate lift (T2) and lighter work (T3). Each time you complete the prescribed sets the weight goes up, and when you miss, the set and rep scheme changes so you can keep going. The app does that bookkeeping for you.`,
    ruleId: "tier-structure",
    seeAlso: ["t1", "t2", "t3", "rotation"],
  },
  t1: {
    term: "T1",
    aka: ["Tier 1"],
    short: "The first and heaviest lift of the day: few reps, heavy weight, for building strength.",
    long: `T1 is the main lift of the workout: squat, bench press, deadlift or overhead press. It starts at ${Object.keys(T1_STAGE_SCHEME)[0]} (5 sets of 3 reps) and the last set is an AMRAP. It gets the longest rest (${duration(REST_SECONDS.T1)}) and the only warm-up sets.`,
    ruleId: "tier-structure",
    seeAlso: ["t2", "t3", "stage", "amrap-plus"],
  },
  t2: {
    term: "T2",
    aka: ["Tier 2"],
    short: "The second lift of the day: a moderate weight for more reps, to build muscle and practise the lift.",
    long: `T2 is one of the four main lifts done lighter and for more reps, usually ${Object.keys(T2_STAGE_SCHEME)[0]} (3 sets of 10). Each main lift is done once as T1 and once as T2 across the rotation. It rests ${duration(REST_SECONDS.T2)} between sets.`,
    ruleId: "tier-structure",
    seeAlso: ["t1", "t3", "stage", "autoregulation"],
  },
  t3: {
    term: "T3",
    aka: ["Tier 3"],
    short: "The lighter exercise at the end of the workout, done for high reps to build muscle.",
    long: `T3 is an assistance exercise such as a lat pulldown or dumbbell row: 3 sets of 15 or more, with the last set as many reps as you can. The weight goes up by 5 lbs when that last set reaches 25 reps (or, when you are not cutting, 50 reps across all three sets). It rests ${duration(REST_SECONDS.T3)} between sets.`,
    ruleId: "t3-progression",
    seeAlso: ["amrap", "t1", "t2"],
  },
  rotation: {
    term: "Rotation",
    aka: [...WORKOUT_ROTATION],
    short: `The four workouts always come in the same order: ${WORKOUT_ROTATION.join(", ")}, then back to the start.`,
    long: `There are four workouts, ${WORKOUT_ROTATION.join(", ")}, and you always do the next one in line. Training at home or at the gym never changes the order: only the exercises are swapped. A workout you start but do not finish does not move you on.`,
    ruleId: "tier-structure",
    seeAlso: ["gzclp", "substitute"],
  },
  "sets-reps": {
    term: "Sets x reps",
    aka: ["5x3", "3x10", "notation"],
    short: "5x3 means 5 sets of 3 reps: do 3 repetitions, rest, and repeat until you have done 5 rounds.",
    long: "The first number is how many sets, the second how many reps in each set. A rep is one full movement, such as standing up once from a squat. A set is a group of reps done without a break.",
    seeAlso: ["amrap-plus", "stage"],
  },
  "amrap-plus": {
    term: "The \"+\" in 5x3+",
    aka: ["plus", "5x3+"],
    short: "The plus means the last set is an AMRAP: do the listed reps, then keep going if you have more in you.",
    long: `A plus after the reps marks the last set as an AMRAP. On T1 stop with about one rep left (RPE ${T1_AMRAP_TARGET_RPE}); on T3 push close to failure. Those extra reps are how the app tracks your strength between weight increases.`,
    ruleId: "amrap-effort",
    seeAlso: ["amrap", "sets-reps", "e1rm"],
  },
  stage: {
    term: "Stage",
    aka: [...Object.keys(T1_STAGE_SCHEME), ...Object.keys(T2_STAGE_SCHEME)],
    short: "The set and rep scheme a lift is on right now; it changes when you miss reps.",
    long: `T1 lifts go ${t1Stages}: the same weight split into smaller sets, so you can keep lifting it after a miss. T2 lifts go ${t2Stages}. The weight still rises each time you complete a stage.`,
    ruleId: "gzclp-progression",
    seeAlso: ["fail-reset", "t1", "t2"],
  },
  "fail-reset": {
    term: "Fail and reset",
    aka: ["failure", "reset"],
    short: "Missing reps moves a lift to its next stage; missing on the last stage restarts it at a lighter weight.",
    long: `A fail means a set fell short of its target reps. The lift moves to the next stage at the same weight. After a miss on the last stage the weight resets to ${resetPct} of what you were lifting and the lift starts again from the first stage.`,
    ruleId: "gzclp-progression",
    seeAlso: ["stage", "freeze"],
  },
  freeze: {
    term: "Freeze",
    aka: ["frozen", "skip"],
    short: "A lift skipped or cut short for pain, a recent run or missing equipment stays where it was: no fail, no increase.",
    long: "When you skip or lighten sets because of pain, tired legs from a run or equipment you do not have, the lift is frozen. It counts as neither a pass nor a fail, so the weight and stage stay put for next time. Stopping part way through an exercise also freezes it.",
    ruleId: "gzclp-progression",
    seeAlso: ["fail-reset", "substitute"],
  },
  "working-weight": {
    term: "Working weight",
    short: "The weight you lift for the real sets of an exercise, after any warm-ups.",
    long: "The working weight is what the program prescribes for a lift today, and what goes up when you complete it. Each lift has its own T1 and T2 working weight. Warm-up sets are lighter and do not count toward progression.",
    ruleId: "gzclp-progression",
    seeAlso: ["warm-up", "stage"],
  },
  "warm-up": {
    term: "Warm-up sets",
    aka: ["warmup"],
    short: "Lighter sets before the heavy lift that get your body ready without tiring you out.",
    long: "Before a T1 lift the app lists a few sets that climb from the empty bar toward your working weight. They prepare your joints and practise the movement. They do not count as volume or toward progression, and you can switch them off.",
    seeAlso: ["working-weight", "t1"],
  },
  accessory: {
    term: "Accessory",
    aka: ["accessories"],
    short: "Optional extra exercises after the main work, such as curls or face pulls, for smaller muscles.",
    long: "Accessories are extras you can add on the ready screen. They do not change your lift weights. While cutting the app suggests fewer of them, because recovery is harder in a calorie deficit.",
    ruleId: "accessories-in-cut",
    seeAlso: ["t3", "training-phase"],
  },
  substitute: {
    term: "Substitute",
    aka: ["home alternative", "swap", "dumbbell"],
    short: "At home, a barbell lift is swapped for a dumbbell or bodyweight version you can do with your equipment.",
    long: "When you train at home the app replaces gym-only exercises with one that fits your equipment and converts the weight. Completing the substitute counts as a pass, so your progression keeps moving. Your gym weight is kept for when you are back.",
    ruleId: "dumbbell-conversion",
    seeAlso: ["gym-debt", "freeze"],
  },
  "gym-debt": {
    term: "Gym debt",
    aka: ["waiting for the gym"],
    short: "Lifts that have grown too heavy for your home dumbbells and are waiting for your next gym session.",
    long: "Once a lift's working weight converts to more than your heaviest dumbbell, home sessions can no longer match it. The app lists those lifts so you know which ones need the gym. Home sessions still count, capped at what your dumbbells allow.",
    ruleId: "dumbbell-conversion",
    seeAlso: ["substitute"],
  },
  "rest-timer": {
    term: "Rest timer",
    aka: ["rest"],
    short: "How long to rest between sets: longer after heavy sets, shorter after light ones.",
    long: `The timer starts after each set: ${duration(REST_SECONDS.T1)} for T1, ${duration(REST_SECONDS.T2)} for T2 and ${duration(REST_SECONDS.T3)} for T3 and accessories. Heavy sets need longer for your muscles to recover their strength. While cutting, T1 and T2 get ${CUTTING_REST_BONUS_SECONDS} seconds more because recovery is slower in a deficit.`,
    ruleId: "rest-heavy",
    seeAlso: ["t1", "training-phase"],
  },
  deload: {
    term: "Deload",
    short: "A planned lighter stretch of training to let built-up fatigue clear before you push again.",
    long: `When several lifts show signs of fatigue at once (estimates dropping, RPE climbing, AMRAP reps falling), a short deload helps. It cuts the weight by ${deloadCut}% while cutting and ${deloadOther}% otherwise, with easier effort. Your previous weights come back afterwards.`,
    ruleId: "deload",
    seeAlso: ["rpe", "e1rm"],
  },
  amrap: {
    term: "AMRAP",
    aka: ["as many reps as possible"],
    short: "As many reps as possible: on that set, keep going past the target until you have only a rep or so left.",
    long: `AMRAP stands for "as many reps as possible". The last set of T1 and T3 is an AMRAP: T1 stops with about one rep left (RPE ${T1_AMRAP_TARGET_RPE}), T3 goes close to failure. The extra reps show how strong you are today and feed the estimated 1RM.`,
    ruleId: "amrap-effort",
    seeAlso: ["amrap-plus", "rpe", "e1rm"],
  },
  rpe: {
    term: "RPE",
    aka: ["effort", "rate of perceived exertion"],
    short: "How hard a set felt on a 1 to 10 scale; 10 means you could not have done another rep.",
    long: "RPE stands for rate of perceived exertion. RPE 10 is an all-out set, RPE 9 means one more rep was possible, RPE 8 two more. The app uses it to spot fatigue and, on T2, to suggest a lighter load.",
    ruleId: "rpe-logging",
    seeAlso: ["rir", "autoregulation", "hard-set"],
  },
  rir: {
    term: "Reps in reserve",
    aka: ["RIR", "reps left"],
    short: "How many more reps you could have done when you stopped a set; RPE 8 means 2 in reserve.",
    long: `Reps in reserve is the other side of RPE: 10 minus your RPE. The estimated 1RM adds them back, up to ${E1RM_MAX_REPS_IN_RESERVE}, so stopping a set early does not look like getting weaker.`,
    ruleId: "rpe-logging",
    seeAlso: ["rpe", "e1rm"],
  },
  "hard-set": {
    term: "Hard set",
    short: "A working set taken close to failure; warm-ups and very easy sets do not count.",
    long: "Hard sets are the ones that drive muscle growth, so weekly volume counts them rather than every set. Warm-ups and sets skipped for pain are left out. Failed sets still count: they were hard.",
    ruleId: "weekly-volume",
    seeAlso: ["weekly-sets", "rpe"],
  },
  autoregulation: {
    term: "Auto-regulation",
    aka: ["load drop"],
    short: "If the first T2 set feels very hard, the app offers a lighter weight for the rest of that exercise.",
    long: `When your first T2 set is RPE ${T2_AUTOREG_RPE_THRESHOLD.cutting} or more while cutting (${T2_AUTOREG_RPE_THRESHOLD.maintaining} maintaining, ${T2_AUTOREG_RPE_THRESHOLD.bulking} bulking), the app suggests dropping ${pct(T2_AUTOREG_DROP.standard)}, or ${pct(T2_AUTOREG_DROP.max)} after an RPE 10 set. Accepting it freezes that lift for the day instead of counting a fail. You can always say no.`,
    ruleId: "t2-autoregulation",
    seeAlso: ["rpe", "t2", "freeze"],
  },
  e1rm: {
    term: "Estimated 1RM",
    aka: ["e1RM", "1RM", "est. 1RM", "one-rep max"],
    short: "A calculated guess at the most you could lift once, worked out from a set of several reps.",
    long: `1RM means one-rep max. Rather than testing it, the app estimates it from your sets with the Epley formula: weight times (1 + reps / 30), adding any reps in reserve you logged. Sets of more than ${E1RM_MAX_REPS} reps are left out because the estimate gets unreliable.`,
    ruleId: "e1rm-estimate",
    seeAlso: ["pr", "rir", "projection"],
  },
  pr: {
    term: "PR / best",
    aka: ["personal record", "best"],
    short: "Your personal record: the highest estimated 1RM you have reached on a lift.",
    long: "A PR is a new best. The app compares estimated 1RMs, so more reps at the same weight can be a PR even if the bar is no heavier.",
    ruleId: "e1rm-estimate",
    seeAlso: ["e1rm", "pr-chance"],
  },
  "pr-chance": {
    term: "PR chance",
    aka: ["likely", "stretch", "unlikely"],
    short: "How many reps today would set a new best, and how reachable that looks from your recent AMRAP sets.",
    long: `The app works out the reps at today's weight that would beat your best estimated 1RM. It compares that with your last ${PR_CHANCE_RECENT_SETS} AMRAP sets: at or below your usual reps is "likely", up to ${PR_STRETCH_MAX_REPS_ABOVE} more is a "stretch", beyond that "unlikely". It is a nudge, not a target you must hit.`,
    ruleId: "e1rm-estimate",
    seeAlso: ["pr", "amrap"],
  },
  projection: {
    term: "Projection",
    short: "A forecast of where a lift's estimated 1RM could be in the coming weeks if training continues.",
    long: "The projection fits a trend to your history and extends it, with a band that widens the further out it goes. You can change the assumptions, such as sessions per week or training phase, to see their effect. It is an estimate, not a promise.",
    ruleId: "projection-rate-of-gain",
    seeAlso: ["e1rm", "training-phase"],
  },
  "weekly-sets": {
    term: "Weekly sets",
    aka: ["volume", "weekly volume"],
    short: "How many hard sets each muscle got this week, the main measure of training volume.",
    long: "Each working set counts fully for the muscles it mainly trains and half for muscles that help. The app adds these up per week so you can see which muscles get plenty and which get little.",
    ruleId: "weekly-volume",
    seeAlso: ["hard-set"],
  },
  "training-phase": {
    term: "Training phase",
    aka: ["cutting", "maintaining", "bulking"],
    short: "Whether you are eating to lose fat (cutting), hold steady (maintaining) or gain (bulking).",
    long: "Recovery is harder in a calorie deficit, so the phase changes the app's coaching. While cutting it adds rest, offers lighter T2 loads sooner and suggests fewer accessories. Set it in Settings.",
    ruleId: "rest-cut-bonus",
    seeAlso: ["rate-of-loss", "rest-timer"],
  },
  "rate-of-loss": {
    term: "Rate of loss",
    short: "How fast your bodyweight is changing per week, as a share of your weight.",
    long: `While cutting, losing about 0.5% to 1% of your bodyweight a week keeps most of your muscle. A change smaller than ${STALL_BAND_PERCENT}% either way counts as a stall. It is worked out from your daily weigh-ins over several weeks, so one day's reading does not swing it.`,
    ruleId: "rate-of-loss",
    seeAlso: ["training-phase"],
  },
};

export const GLOSSARY_THEMES: Record<GlossaryTheme, TermId[]> = {
  Program: [
    "gzclp", "t1", "t2", "t3", "rotation", "sets-reps", "amrap-plus", "stage", "fail-reset",
    "freeze", "working-weight", "warm-up", "accessory", "substitute", "gym-debt",
    "rest-timer", "deload",
  ],
  Effort: ["amrap", "rpe", "rir", "hard-set", "autoregulation"],
  Progress: ["e1rm", "pr", "pr-chance", "projection", "weekly-sets"],
  Body: ["training-phase", "rate-of-loss"],
};

export const TERM_IDS = Object.keys(GLOSSARY) as TermId[];

export function isTermId(value: string): value is TermId {
  return Object.prototype.hasOwnProperty.call(GLOSSARY, value);
}

/** Term ids whose term or aka contains the query (case-insensitive); all for an empty query. */
export function searchGlossary(query: string): TermId[] {
  const q = query.trim().toLowerCase();
  if (!q) return TERM_IDS;
  return TERM_IDS.filter((id) => {
    const { term, aka = [] } = GLOSSARY[id];
    return [term, ...aka].some((name) => name.toLowerCase().includes(q));
  });
}
