import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";
import {
  RECOVERY_HOURS,
  CUTTING_RECOVERY_BONUS_HOURS,
  LONG_BREAK_DAYS,
} from "@/lib/recovery";
import {
  DECAY_TIERS,
  DECAY_PHASE_MULTIPLIERS,
  MAX_DECAY,
} from "@/lib/weightDecay";

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** "5% after 21–41 days, 10% after 42–69 days, 15% after 70 days or more" */
function describeDecayTiers(): string {
  const parts: string[] = [];
  DECAY_TIERS.forEach((tier, i) => {
    if (tier.baseDecay === 0) return;
    const from = DECAY_TIERS[i - 1].maxDays + 1;
    const range =
      tier.maxDays === Infinity
        ? `${from} days or more`
        : `${from}–${tier.maxDays} days`;
    parts.push(`${pct(tier.baseDecay)} after ${range}`);
  });
  return parts.join(", ");
}

export const RECOVERY_RULES = {
  "recovery-windows": {
    area: "recovery",
    status: "active",
    title: "What do the recovery statuses mean?",
    summary: "Hard sets take 1–3 days to recover from; stress can slow that",
    appBehavior: `A lift shows Recovering for ${RECOVERY_HOURS.ready} hours after it was last trained, Ready from ${RECOVERY_HOURS.ready} hours, Primed from ${RECOVERY_HOURS.primed} to ${RECOVERY_HOURS.pastPeak} hours, then Ready again. While cutting, ${CUTTING_RECOVERY_BONUS_HOURS} hours are added to each of these. After ${LONG_BREAK_DAYS} days it shows Long break. The setup screen notes when a lift in today's workout was trained less than ${RECOVERY_HOURS.ready} hours ago.`,
    rationale:
      "After hard sets, performance takes roughly one to three days to come back, and longer when sets were taken to failure. In one study, lifters under high life stress recovered more slowly over four days.",
    caveat: `The "Primed" window and the extra ${CUTTING_RECOVERY_BONUS_HOURS} hours while cutting are coaching heuristics with no direct research behind them. Statuses are based on time alone; how you feel on the day counts for more.`,
    strength: "limited",
    sources: ["moranNavarro2017", "stults2014"],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/recovery.ts#calculateRecoveryStatus"],
    surfaces: [
      "src/components/Dashboard/RecoveryStatusBars.tsx",
      "src/app/workout/configure/page.tsx",
    ],
  },
  "time-off": {
    area: "recovery",
    status: "active",
    title: "Why lighter weights after a break?",
    summary: "Short breaks cost little strength; long ones come back fast",
    appBehavior: `Breaks of up to ${LONG_BREAK_DAYS - 1} days change nothing. After that the setup screen suggests starting lighter: ${describeDecayTiers()}. The suggestion is scaled by ${DECAY_PHASE_MULTIPLIERS.cutting} while cutting and ${DECAY_PHASE_MULTIPLIERS.bulking} while bulking, and never exceeds ${pct(MAX_DECAY)}. You can always keep your old weight.`,
    rationale:
      "Strength is well preserved through breaks: one session a week maintains it for months, and after a full 10-week layoff trainees were back to their pre-break level in about 5 weeks. Losses do grow with the length of the break, so the suggestion scales with time away.",
    caveat:
      "The research shows the direction and rough size of the effect; the exact percentages are this app's judgment, and the phase scaling is a heuristic. The 10-week study used people new to lifting.",
    strength: "limited",
    sources: ["spiering2021", "halonen2024", "bosquet2013"],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/weightDecay.ts#calculateWeightDecay",
      "src/lib/recovery.ts#LONG_BREAK_DAYS",
      "src/lib/inactivity.ts#checkInactivity",
    ],
    surfaces: ["src/app/workout/configure/page.tsx"],
  },
  readiness: {
    area: "recovery",
    status: "active",
    title: "Why does the app ask about sleep and stress?",
    summary: "Poor sleep and high stress both reduce performance and recovery",
    appBehavior:
      "Before a workout you can log last night's sleep and your stress or energy. If you report under 5 hours of sleep and low energy together, the app suggests skipping accessories. Nothing else changes.",
    rationale:
      "A night of lost or restricted sleep lowers physical performance by about 7.6% on average, and lifters under high life stress recover strength more slowly after a hard session.",
    caveat:
      "The suggestion is deliberately mild. The app does not yet use these answers to change loads or recovery estimates.",
    strength: "moderate",
    sources: ["craven2022", "stults2014"],
    reviewedOn: "2026-11",
    implementedIn: ["src/components/PreWorkout/ReadinessCheck.tsx#ReadinessCheck"],
    surfaces: ["src/components/PreWorkout/ReadinessCheck.tsx"],
  },
  deload: {
    area: "recovery",
    status: "planned",
    title: "What would a deload look like?",
    summary: "Deloads have not been shown to improve gains; keep them short",
    appBehavior:
      "Rule in code: reduce T1 and T2 weights by 10% (15% while cutting) for four sessions, reduce T3 volume and limit accessories, then restore the previous weights. It is not connected, so the app never starts a deload.",
    rationale:
      "Trials so far show deloads cost little but do not improve results: a week off mid-program led to smaller strength gains, and reduced-volume weeks were neutral. When training is reduced, keeping the load heavy is what preserves strength.",
    strength: "limited",
    sources: ["coleman2024", "pancar2026", "spiering2021"],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/deload.ts#generateDeloadPrescription"],
    surfaces: [],
    activationNotes:
      "Change the prescription to cut sets (by a third to a half) and keep the load, shorten it, and make it optional.",
  },
  "fatigue-detection": {
    area: "recovery",
    status: "planned",
    title: "How would the app detect built-up fatigue?",
    summary: "Fatigue checks from estimated 1RM, RPE and AMRAP trends",
    appBehavior:
      "Rule in code: flag a lift when estimated 1RM falls, RPE rises or AMRAP reps fall for 2–4 sessions in a row (fewer while cutting). Two or more flags recommend a deload. Not connected.",
    rationale:
      "Tracking performance trends is a reasonable way to spot fatigue, but no study validates these specific triggers.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/deload.ts#checkSystemicFatigue"],
    surfaces: [],
    activationNotes:
      "Rising RPE and falling AMRAP reps are expected when the weight goes up every session. Compare at equal load, or use the estimated 1RM trend only, before connecting.",
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
