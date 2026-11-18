// What the accessory why sheet says (A7): the score's parts beside their caps, in the
// order the rule weighs them, and where the weight comes from. Pure; no React.
import {
  ACCESSORY_DAY_FIT_WEIGHT,
  ACCESSORY_HABIT_WEIGHT,
  ACCESSORY_PIN_SCORE,
  ACCESSORY_PREFERRED_WEIGHT,
  ACCESSORY_RECOVERY_PENALTY,
  ACCESSORY_SHORTFALL_WEIGHT,
  ACCESSORY_SPREAD_PENALTY,
  WEEKLY_SET_TARGET,
  type AccessoryCandidate,
  type AccessoryPrescription,
  type AccessoryScoreParts,
} from "@/lib/accessories/index";
import { historyDay } from "@/components/Today/todayModel";
import { formatLbs } from "@/components/Today/format";

export interface ScorePartLine {
  key: keyof AccessoryScoreParts;
  label: string;
  /** What earns it, in a few words. */
  hint: string;
  value: number;
  /** The most it can add (or, for a penalty, take off). */
  cap: number;
  penalty: boolean;
}

const PARTS: readonly Omit<ScorePartLine, "value">[] = [
  { key: "pinned", label: "Always on this day", hint: "you pinned it", cap: ACCESSORY_PIN_SCORE, penalty: false },
  { key: "preferred", label: "Preferred", hint: "you marked it", cap: ACCESSORY_PREFERRED_WEIGHT, penalty: false },
  { key: "habit", label: "Habit", hint: "how often and how lately you do it", cap: ACCESSORY_HABIT_WEIGHT, penalty: false },
  {
    key: "shortfall",
    label: "This week's shortfall",
    hint: `its muscle under ${WEEKLY_SET_TARGET} sets`,
    cap: ACCESSORY_SHORTFALL_WEIGHT,
    penalty: false,
  },
  { key: "dayFit", label: "Fit with the day", hint: "muscles today's lifts leave alone", cap: ACCESSORY_DAY_FIT_WEIGHT, penalty: false },
  { key: "recovery", label: "Recovery", hint: "its muscle still recovering", cap: ACCESSORY_RECOVERY_PENALTY, penalty: true },
  { key: "spread", label: "Spread", hint: "another pick works the same muscle", cap: ACCESSORY_SPREAD_PENALTY, penalty: true },
];

/** The score's parts in the rule's order, each with its cap. */
export function scorePartLines(parts: AccessoryScoreParts): ScorePartLine[] {
  return PARTS.map((part) => ({ ...part, value: parts[part.key] }));
}

/** "+18.2", "−8", "0". */
export function signed(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "0";
  return rounded > 0 ? `+${rounded}` : `−${Math.abs(rounded)}`;
}

/** Where the weight comes from, as a heading. */
export function basisTitle(p: Pick<AccessoryPrescription, "basis" | "verdict">): string {
  switch (p.basis) {
    case "hand":
      return "Set by you";
    case "progression":
      return p.verdict === "up" ? "Up one step" : p.verdict === "down" ? "Down to build back" : "Same weight";
    case "history":
      return "From your history";
    case "none":
      return "No weight yet";
  }
}

/** "Last time, Nov 10: 25 lb × 15, 15, 14". Null when it was never done as an accessory. */
export function lastTimeText(p: Pick<AccessoryPrescription, "last">, now: Date = new Date()): string | null {
  if (!p.last) return null;
  return `Last time, ${historyDay(p.last.date.getTime(), now)}: ${formatLbs(p.last.weight)} lb × ${p.last.reps.join(", ")}`;
}

/** "3rd of 14 for today". */
export function rankText(candidate: AccessoryCandidate, ranked: readonly AccessoryCandidate[]): string | null {
  const at = ranked.findIndex((c) => c.exerciseId === candidate.exerciseId);
  if (at < 0) return null;
  const n = at + 1;
  const suffix = n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th";
  return `${n}${suffix} of ${ranked.length} for today`;
}
