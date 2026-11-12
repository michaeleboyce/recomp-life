import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";
import { PROJECTION_COEFFICIENTS as C } from "@/lib/projection/coefficients";

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;
/** Rate multiplier for doubling a dose under the given exponent, e.g. 2 ^ 0.1 -> "7%". */
const doubling = (exponent: number) => pct(2 ** exponent - 1);
/** Weeks until the projected rate halves at the given weekly retention. */
const halfLifeWeeks = (retention: number) => Math.round(Math.log(0.5) / Math.log(retention));

const IMPLEMENTED = ["src/lib/projection/coefficients.ts#PROJECTION_COEFFICIENTS"] as const;
const ACTIVATION =
  "Becomes active when the projection screen (src/app/progress/lift/[id]/projection) shows an EvidenceLine for it.";

export const PROJECTION_RULES = {
  "projection-dose-response": {
    area: "projection",
    status: "planned",
    title: "How much would more sets or sessions speed up my lift?",
    summary: "More sessions help strength a little; extra sets help even less",
    appBehavior: `The projection scales your own measured rate of gain. At equal weekly sets, the rate is multiplied by (new sessions ÷ current sessions) ^ ${C.frequencyExponent}, so doubling sessions adds about ${doubling(C.frequencyExponent)}. Weekly sets for the lift's main muscles scale it by (new ÷ current) ^ ${C.volumeExponent}, so doubling sets adds about ${doubling(C.volumeExponent)}, and sets beyond ${C.weeklySetsCeiling} a week add nothing. The combined effect is held between ×${C.minDoseMultiplier} and ×${C.maxDoseMultiplier}.`,
    rationale:
      "The largest analysis of training dose found strength rises with weekly sets but levels off quickly, with no clear extra gain beyond about 4–5 sets a week, while training a lift more often kept adding strength with diminishing returns even when total sets were accounted for.",
    caveat:
      "The research gives the shape, not these numbers: the exponents are our conversion of meta-regression slopes, and the frequency one is halved because an earlier meta-analysis found no effect of frequency when weekly volume was equal. Most studies were short and used novel test lifts, where practice alone makes people stronger.",
    strength: "limited",
    sources: ["pelland2026", "grgic2018frequency", "acsm2026"],
    reviewedOn: "2026-11",
    implementedIn: IMPLEMENTED,
    surfaces: [],
    activationNotes: ACTIVATION,
  },
  "projection-specificity": {
    area: "projection",
    status: "planned",
    title: "Do other exercises for the same muscles count toward this lift?",
    summary: "Other exercises for the same muscles count, but less than the lift",
    appBehavior: `When projecting a lift, each weekly set of a different exercise for its main muscles counts as ${C.relatedSetTransfer} of a set of the lift itself before the volume curve is applied.`,
    rationale:
      "Strength is specific: gains are largest in the exercise you practise. Counting other exercises for the same muscles as half a set predicted strength gains far better than ignoring them or counting them fully, and strength in an untrained test of the same muscles improved by less than half as much as in the trained lift.",
    caveat:
      "Only whole, half and zero credit have been compared, and the transfer study measured isometric tests rather than another barbell lift, so the exact figure is a judgment rounded down to stay cautious.",
    strength: "limited",
    sources: ["pelland2026", "saeterbakken2025", "mattocks2017"],
    reviewedOn: "2026-11",
    implementedIn: IMPLEMENTED,
    surfaces: [],
    activationNotes: ACTIVATION,
  },
  "projection-rate-of-gain": {
    area: "projection",
    status: "planned",
    title: "Why does the projection curve flatten, and why is the range so wide?",
    summary: "Strength gains slow over time, and single estimates are noisy",
    appBehavior: `The projected weekly gain keeps ${pct(C.weeklyRateRetention)} of the previous week's, so it halves in about ${halfLifeWeeks(C.weeklyRateRetention)} weeks. The range is ${C.bandWidthSd} times the scatter of your own estimates around their trend (about an 80% range), widened by (1 + ${C.bandGrowth} × √weeks ahead).`,
    rationale:
      "In nearly 15,000 adults' training records, strength rose quickly at first and then ever more slowly, practically levelling off after one to two years, and stronger powerlifters improved more slowly than weaker ones. Even a tested 1RM varies by a few percent from day to day, and estimates from rep sets vary more, so a single projected number would look more certain than it is.",
    caveat:
      "How fast gains slow depends on how long you have trained; the app uses one rate that fits someone about four months in, so it under-promises for longer-trained lifters and may over-promise for someone in their first few months. The studies were of machine training and competition totals, not of a GZCLP lifter's estimated 1RM. The growth of the range is a judgment, not a measured value.",
    strength: "limited",
    sources: ["steele2023", "latella2020", "grgic2020", "nuzzo2024"],
    reviewedOn: "2026-11",
    implementedIn: IMPLEMENTED,
    surfaces: [],
    activationNotes: ACTIVATION,
  },
  "projection-energy-deficit": {
    area: "projection",
    status: "planned",
    title: "How much does cutting slow strength gains?",
    summary: "A calorie deficit slows strength gains only a little, if at all",
    appBehavior: `The projected rate is multiplied by ${C.phaseMultiplier.cutting} while cutting and ${C.phaseMultiplier.maintaining} while maintaining, relative to ${C.phaseMultiplier.bulking} while bulking.`,
    rationale:
      "A meta-analysis found training in a calorie deficit limited lean-mass gains but did not significantly reduce strength gains. In trained lifters, eating 5% or 15% above maintenance did not improve squat 1RM over eating at maintenance.",
    caveat:
      "The research supports a small or no penalty but gives no number; the deficit studies were mostly in untrained people, and the surplus trial had 17 finishers. The app keeps a modest cutting penalty, based on the negative but uncertain average effect, so it does not over-promise.",
    strength: "limited",
    sources: ["murphyKoehler2022", "helms2023"],
    reviewedOn: "2026-11",
    implementedIn: IMPLEMENTED,
    surfaces: [],
    activationNotes: ACTIVATION,
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
