import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";
import { PHASE_ACCESSORY_CAP } from "@/lib/accessories";
import {
  ACCESSORY_DAY_FIT_WEIGHT,
  ACCESSORY_DAY_HARD_SETS,
  ACCESSORY_HABIT_WEIGHT,
  ACCESSORY_PREFERRED_WEIGHT,
  ACCESSORY_RECOVERY_PENALTY,
  ACCESSORY_SHORTFALL_FULL_SETS,
  ACCESSORY_SHORTFALL_WEIGHT,
  ACCESSORY_SPREAD_PENALTY,
  WEEKLY_SET_TARGET,
} from "@/lib/accessories/select";
import { STRENGTH_POOLING } from "@/lib/strength";
import { SWAP_PAIR_OVERLAP_PENALTY, SWAP_SET_LIMIT } from "@/lib/swap/combos";
import {
  SWAP_COMPOUND_MIN_MUSCLES,
  SWAP_HISTORY_HALF_SESSIONS,
  SWAP_HISTORY_WEIGHT,
  SWAP_KNOWN_WEIGHT_POINTS,
  SWAP_PAIN_MIN_SEVERITY,
  SWAP_PAIN_PENALTY,
  SWAP_PREFERRED_POINTS,
  SWAP_PRIMARY_WEIGHT,
  SWAP_RECOVERY_PENALTY,
  SWAP_SAME_MOVEMENT_POINTS,
  SWAP_SECONDARY_WEIGHT,
  SWAP_TIER_FIT_POINTS,
} from "@/lib/swap/recommend";
import { DEFAULT_SESSION_MINUTES, SESSION_MINUTE_CHOICES } from "@/lib/accessories/sessionBudget";
import { SESSION_LENGTH_MODEL } from "@/lib/forecast/coefficients";

export const VOLUME_RULES = {
  "weekly-volume": {
    area: "volume",
    status: "active",
    title: "How is weekly volume counted, and why 10 sets?",
    summary: "More weekly sets build more muscle, with diminishing returns",
    appBehavior:
      "Each completed set counts 1 for the muscles an exercise mainly trains and 0.5 for muscles it trains indirectly. Warm-ups and sets skipped for pain are excluded. The chart marks 10 weekly sets per muscle group as the target.",
    rationale:
      "The largest analysis of training volume counted sets exactly this way and found muscle growth rises with weekly sets, with diminishing returns. Programs with 10 or more weekly sets per muscle group also showed little or no muscle loss while dieting.",
    caveat:
      "There is no magic number: 10 is a practical target, not a threshold. Strength gains level off at much lower volumes.",
    strength: "moderate",
    sources: ["pelland2026", "roth2022"],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/volumeTracking.ts#calculateMuscleGroupVolume",
      "src/lib/muscleLoad.ts#weeklyHeatLevel",
    ],
    surfaces: ["src/components/Progress/MusclesTab.tsx"],
  },
  "accessories-in-cut": {
    area: "volume",
    status: "active",
    title: "Why not fewer accessories while cutting?",
    summary: "Keeping volume up while dieting may help hold on to muscle",
    appBehavior: `The picker lets you add up to ${PHASE_ACCESSORY_CAP.cutting} accessories per session while cutting, the same as while maintaining (${PHASE_ACCESSORY_CAP.maintaining}), and ${PHASE_ACCESSORY_CAP.bulking} while bulking.`,
    rationale:
      "It is tempting to do less while eating less, but the research does not support that. A review of dieting lifters found programs with 10 or more weekly sets per muscle group lost little or no muscle, and a calorie deficit mainly limits muscle gain rather than strength.",
    caveat:
      "The evidence is suggestive, not conclusive: one trial found no difference between moderate and high volume. The caps themselves are a practical choice to keep sessions manageable.",
    strength: "limited",
    sources: ["roth2022", "murphyKoehler2022"],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/accessories.ts#getPhaseAccessoryCap"],
    surfaces: ["src/components/PreWorkout/AccessorySheet.tsx"],
  },
  "accessory-selection": {
    area: "volume",
    status: "active",
    title: "How are a workout's accessories chosen?",
    summary: "A scored list: your pins and preferences, your habits, and this week's gaps",
    appBehavior: `Every workout gets accessories up to the phase's number, chosen from a scored list. Exercises you pinned to the day are always in. Then points are added: ${ACCESSORY_PREFERRED_WEIGHT} for an exercise you marked preferred; up to ${ACCESSORY_HABIT_WEIGHT} for one you do often and lately (each session counts half as much for every ${STRENGTH_POOLING.evidenceHalfLifeDays} days of age, and more when it was done on the same kind of day); up to ${ACCESSORY_SHORTFALL_WEIGHT} when its main muscle is short of ${WEEKLY_SET_TARGET} sets this week, counting the sets today's main lifts will add (full at ${ACCESSORY_SHORTFALL_FULL_SETS} short); up to ${ACCESSORY_DAY_FIT_WEIGHT} when today's main lifts leave its muscles alone (none once they give it ${ACCESSORY_DAY_HARD_SETS} sets). ${ACCESSORY_RECOVERY_PENALTY} come off when its main muscle is still recovering, and ${ACCESSORY_SPREAD_PENALTY} when another pick already works that muscle and it is not short (such a repeat is picked only when nothing else is left). Blocked exercises are never offered; at home a gym-only exercise is swapped for its home version or left out, and the home version gives the reason it earned itself, with the gym exercise it stands in for as a note after it. With no accessory history the day's usual list is used. They are chosen once for the day, the same on Today, the Ready screen and the workout, and each comes with its reasons and score. Removing, swapping or adding one is yours and always wins; the setting can also be "ask me" (none chosen) or "none".`,
    rationale:
      "Each part follows something the app already counts: what you choose, what you actually do, the weekly set target and recovery. The pins and preferences come first because you have the final say.",
    caveat:
      "The points are judgment, not research: no study ranks these reasons against each other. The order of the parts is a design choice, shown with every pick so it can be checked and overridden.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/accessories/select.ts#chooseAccessories",
      "src/lib/workout/accessoryPlan.ts#planAccessories",
    ],
    surfaces: ["src/components/PreWorkout/AccessorySheet.tsx", "src/components/Why/AccessoryWhySheet.tsx"],
  },
  "swap-recommendation": {
    area: "volume",
    status: "active",
    title: "How are swaps recommended?",
    summary: "Ranked by muscles covered, movement, your choices and history, and pain",
    appBehavior: `Rule in code: when an exercise is swapped, every exercise that shares one of its main muscles is offered, best first, with its score broken into parts. Up to ${SWAP_PRIMARY_WEIGHT} points for covering the original's main muscles (in proportion) and up to ${SWAP_SECONDARY_WEIGHT} for its helper muscles; ${SWAP_SAME_MOVEMENT_POINTS} for a version of the same movement (the dumbbell or barbell form, or a home exercise for the lift), else ${SWAP_TIER_FIT_POINTS} when it fits the tier (for a T1 or T2, a compound lift working at least ${SWAP_COMPOUND_MIN_MUSCLES} muscles); ${SWAP_PREFERRED_POINTS} for an exercise you marked preferred; up to ${SWAP_HISTORY_WEIGHT} for one you have done often and lately, app and imported history alike (each session counts half as much for every ${STRENGTH_POOLING.evidenceHalfLifeDays} days of age; half the points at ${SWAP_HISTORY_HALF_SESSIONS} such sessions); ${SWAP_KNOWN_WEIGHT_POINTS} when its weight comes from your own sets or the strength model rather than a default. ${SWAP_RECOVERY_PENALTY} come off when it adds a main muscle that is still recovering, and ${SWAP_PAIN_PENALTY} when it loads a joint with a pain entry of severity ${SWAP_PAIN_MIN_SEVERITY} or more. Blocked exercises are never offered, and at home nothing that needs a gym. Each comes with the weight, sets and reps it would be done at, from the existing weight rules (its own recent sets, the strength model, an accessory's progression, the starting ratio), and a program lift keeps its sets and reps. When no single exercise covers every main muscle, up to ${SWAP_SET_LIMIT} pairs that together do are offered, ${SWAP_PAIR_OVERLAP_PENALTY} points off a pair for each main muscle both cover. The swap sheet (from Edit workout before a workout, and from an exercise's block or the overview during one) shows the best few with their weight, sets and reps, reason and history, the score parts on tap, the pairs, and every other candidate below. An exercise added beside a swapped program lift (the second of a pair, or every replacement once sets of the lift are logged) stands in for it: it is logged only, never judged as an accessory, and the workout's summary says what it stood in for. A swap applies to that workout only; "Every time" uses your exercise preferences at that location: for an accessory it leaves the original out and marks the replacement preferred, for a program lift it marks the replacement preferred so it is suggested first, since the program always keeps its own lift.`,
    rationale:
      "A replacement should train what the original trained, ideally in the same movement, so the session still does its job. Your own choices, what you already do and a weight you can trust come next; recovering muscles and painful joints are reasons to look elsewhere.",
    caveat:
      "The points are judgment, not research: no study ranks these reasons against each other, and muscles covered is read from the app's own list of main and helper muscles per exercise. The parts are shown with every suggestion so they can be checked, and the choice is always yours.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/swap/recommend.ts#recommendSwaps",
      "src/lib/swap/combos.ts#recommendSwapSets",
      "src/lib/swap/midWorkout.ts#midWorkoutSwap",
      "src/lib/swap/progressionEffect.ts#standInText",
    ],
    surfaces: ["src/components/Swap/SwapSheet.tsx"],
  },
  "session-length-budget": {
    area: "volume",
    status: "active",
    title: "Why are some accessories left out to fit the session length?",
    summary: "Accessories are kept to the length you plan for; the main lifts never are",
    appBehavior: `You choose the session length to plan for: ${SESSION_MINUTE_CHOICES.join(", ")} minutes or no limit (${DEFAULT_SESSION_MINUTES} until you choose), in Settings or for one workout on the Ready screen. The app times the plan as Today, the Ready screen and Coming up show it: on paper, every set plus the rest after it (warm-ups included when they are on, and your per-set plans for the day), then, once you have finished ${SESSION_LENGTH_MODEL.minSessionsForCorrection} sessions, times your own pace (the median of real length over length on paper in your latest ${SESSION_LENGTH_MODEL.recentSessions}). The accessories it chose are then added best first, each only if the plan with it stays within the length; one that does not fit is left out, with "Left out to fit" and a way to add it anyway, and the next one is tried. The main lifts (T1, T2 and T3) are never dropped or shortened. Accessories you pinned to the day are always kept, even past the length. When the main lifts alone take longer than the length, no other accessory is added and the app says so. A workout already started keeps the accessories it started with.`,
    rationale:
      "A planning convenience: a session that fits the time you have is easier to finish, and leaving out the lowest-ranked extras first keeps the program's lifts, which drive progression, untouched.",
    caveat:
      "This is not a research finding. The length is the app's own estimate, on paper and corrected by your pace, which no study has checked for this kind of session (the research notes found nothing on predicting a strength session's length from its sets and rests). Your own changes on the Ready screen are not re-measured: the accessories are chosen before them. The choices of length are conveniences, not targets.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/accessories/sessionBudget.ts#fitAccessoriesToBudget",
      "src/lib/workout/accessoryPlan.ts#planAccessories",
      "src/lib/forecast/sessionLength.ts#sessionPaceCorrection",
    ],
    surfaces: [
      "src/components/PreWorkout/AccessorySheet.tsx",
      "src/components/PreWorkout/TimeEstimate.tsx",
      "src/components/Today/AccessoryRows.tsx",
      "src/app/settings/page.tsx",
      "src/components/Upcoming/UpcomingWorkoutView.tsx",
    ],
  },
  "volume-ratio": {
    area: "volume",
    status: "planned",
    title: "How much accessory work is too much?",
    summary: "A guard against sessions growing too long",
    appBehavior:
      "Rule in code: warn when T3 and accessory reps exceed 5 times (cutting), 7 times (maintaining) or 10 times (bulking) the T1 reps in a session. Not connected.",
    rationale:
      "A practical limit on session length. No research supports these particular ratios.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/volumeRatio.ts#calculateSessionVolumeRatio"],
    surfaces: [],
    activationNotes:
      "The cutting message says extra volume will impair recovery, which the research on dieting lifters does not support. Reword or drop it before connecting.",
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
