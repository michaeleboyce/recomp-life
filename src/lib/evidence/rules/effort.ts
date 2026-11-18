import type { EvidenceRule, RepsInReserve, TrainingPhase } from "@/types";
import type { SourceId } from "../sources";
import { T1_AMRAP_TARGET_REPS_IN_RESERVE } from "@/lib/amrap";
import { T2_AUTOREG_SUGGESTION, T2_AUTOREG_DROP } from "@/lib/progression";
import { E1RM_MAX_REPS } from "@/lib/e1rm";
import { REPS_IN_RESERVE_OPTIONS, REPS_IN_RESERVE_QUESTION, RIR_ESTIMATE } from "@/lib/effort";

/** 0.075 -> "7.5%": a drop size keeps its half percent. */
const pct = (fraction: number) => `${Math.round(fraction * 1000) / 10}%`;

/** "0, 1-2 or 3+". */
const ANSWERS = `${REPS_IN_RESERVE_OPTIONS.slice(0, -1).join(", ")} or ${REPS_IN_RESERVE_OPTIONS[REPS_IN_RESERVE_OPTIONS.length - 1]}`;

/** "0 for 0, 1.5 for 1-2, 3 for 3+": the reps credited for each answer. */
const CREDITS = REPS_IN_RESERVE_OPTIONS.map((answer) => `${RIR_ESTIMATE[answer]} for ${answer}`).join(", ");

const PHASES = Object.keys(T2_AUTOREG_SUGGESTION) as TrainingPhase["mode"][];

/** "in every phase", or "while cutting" / "while cutting or maintaining". */
function phasesSuggesting(answer: RepsInReserve, kind: "max" | "step"): string {
  const phases = PHASES.filter((phase) => T2_AUTOREG_SUGGESTION[phase][answer] === kind);
  if (phases.length === PHASES.length) return "in every phase";
  return `while ${phases.join(" or ")} only`;
}

const T2_MAX_DROP = `${pct(T2_AUTOREG_DROP.max)} (never less than one ${T2_AUTOREG_DROP.stepLbs} lb step)`;
const T2_STEP_DROP = `one ${T2_AUTOREG_DROP.stepLbs} lb step down`;

export const EFFORT_RULES = {
  "amrap-effort": {
    area: "effort",
    status: "active",
    title: "How hard should the last set be?",
    summary: `Heavy sets: stop with ${T1_AMRAP_TARGET_REPS_IN_RESERVE} reps left. Lighter sets: go close to failure`,
    appBehavior: `On the last T1 set the app asks you to stop with ${T1_AMRAP_TARGET_REPS_IN_RESERVE} reps left. On the last T3 set it asks you to push close to failure.`,
    rationale:
      "Strength gains are similar whether heavy sets stop short of failure or reach it, and sets taken to failure take a day or two longer to recover from. Muscle growth does benefit from getting close to failure, which is why the lighter T3 sets are pushed harder.",
    caveat: `People tend to have about one more rep left than they think, so a set you honestly judge as ${T1_AMRAP_TARGET_REPS_IN_RESERVE} reps left is already a hard set.`,
    strength: "moderate",
    sources: ["robinson2024", "acsm2026", "moranNavarro2017"],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/amrap.ts#getAMRAPGuidance"],
    surfaces: ["src/components/ActiveWorkout/AMRAPIndicator.tsx"],
  },
  "effort-logging": {
    area: "effort",
    status: "active",
    title: "Why does the app ask how many reps I had left?",
    summary: "Reps left lets the app adjust for how hard the set really was",
    appBehavior: `After a set the app asks one optional question, "${REPS_IN_RESERVE_QUESTION}", with ${REPS_IN_RESERVE_OPTIONS.length} answers: ${ANSWERS}. The answer on the first T2 set decides whether the app suggests a lighter weight for the rest of that exercise, and the answer on a T1 AMRAP set adds the reps you had left to your estimated 1RM (${CREDITS}). A set with no answer is never given a guessed one.`,
    rationale:
      "Self-ratings of reps left are accurate enough to be useful: on average people are off by about one rep, and they are most accurate close to failure and in sets of 12 reps or fewer. With an error of about one rep, finer answers would not be more accurate, so the app asks for a few broad ones.",
    caveat:
      "The choice of exactly these three answers is the app's own design, built on that roughly one-rep error; the review did not test any set of answers. Ratings on high-rep sets are less reliable, so the app only acts on the answer for T1 and T2 sets.",
    strength: "moderate",
    sources: ["halperin2022"],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/effort.ts#repsInReserveCredit",
      "src/components/ActiveWorkout/EffortSelector.tsx#EffortSelector",
    ],
    surfaces: ["src/components/ActiveWorkout/EffortSelector.tsx"],
  },
  "t2-autoregulation": {
    area: "effort",
    status: "active",
    title: "Why is the app suggesting a lighter weight?",
    summary: "A very hard first set means the planned load is too heavy today",
    appBehavior: `If the first T2 set ends with 0 reps left, the app suggests dropping ${T2_MAX_DROP} for the remaining sets, ${phasesSuggesting("0", "max")}. With 1-2 reps left it suggests ${T2_STEP_DROP}, ${phasesSuggesting("1-2", "step")}. Otherwise there is no suggestion. Accepting freezes T2 progression for that session; it is not counted as a failure.`,
    rationale:
      "Adjusting load to how the session is actually going produced larger strength gains than sticking to fixed loads in a meta-analysis of 8 studies. Effort ratings are most accurate in exactly this situation: close to failure, in sets of 12 reps or fewer.",
    caveat: `The split by phase and the drop sizes (${pct(T2_AUTOREG_DROP.max)}, or ${T2_STEP_DROP}) are coaching heuristics, not research findings, and the studies were small and short. While cutting, the suggestion now also appears at 2 reps left, because the 1-2 answer covers both.`,
    strength: "moderate",
    sources: ["zhang2021", "halperin2022"],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/progression.ts#evaluateT2AutoRegulation"],
    surfaces: ["src/app/workout/active/page.tsx"],
  },
  "e1rm-estimate": {
    area: "effort",
    status: "active",
    title: "How is my 1RM estimated?",
    summary: "Estimated from your heavy AMRAP set; best read as a trend",
    appBehavior: `Uses the Epley formula (weight × (1 + reps ÷ 30)) on T1 AMRAP sets of ${E1RM_MAX_REPS} reps or fewer. If you say how many reps you had left, those reps are added first: ${CREDITS}. The trend arrow compares your last 3 estimates. Today reports a new best estimate from the last 7 days, and notes when a lift's last three estimates have fallen. Sets imported from another app are estimated the same way, each session's best normal set (warm-ups and drops never count), and shown on the lift pages, the projection, the Strength tab and Today, marked as imported; a best among them is labelled as history and never counts as a new best, which is judged on the workouts you log here.`,
    rationale:
      "No formula fits everyone: the reps possible at a given percentage of 1RM differ between exercises and between people, and estimates get worse as reps climb. Within one lift the same formula still tracks change well, so the trend is more trustworthy than the number.",
    caveat: `Treat the figure as an estimate, not a tested max. The 3+ answer counts as ${RIR_ESTIMATE["3+"]}, so an estimate from such a set is a lower bound.`,
    strength: "limited",
    sources: ["nuzzo2024", "halperin2022"],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/e1rm.ts#calculateE1RM", "src/lib/import/history.ts#importedLiftIndex"],
    surfaces: [
      "src/app/1rm-calculator/page.tsx",
      "src/components/ExercisePage/ExerciseStrength.tsx",
      "src/components/Lift/PrLine.tsx",
      "src/components/Today/AttentionList.tsx",
    ],
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
