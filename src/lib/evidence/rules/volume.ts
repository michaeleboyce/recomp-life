import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";
import { PHASE_ACCESSORY_CAP } from "@/lib/accessories";

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
    surfaces: ["src/components/Charts/VolumeBars.tsx"],
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
    surfaces: ["src/components/PreWorkout/AccessoryPicker.tsx"],
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
