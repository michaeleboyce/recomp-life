import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";
import { DUMBBELL_LOAD_FACTOR } from "@/lib/dbConversion";

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;

export const EQUIPMENT_RULES = {
  "dumbbell-conversion": {
    area: "equipment",
    status: "active",
    title: "How are barbell weights converted to dumbbells?",
    summary: "Dumbbell presses run about 17–20% lighter than the barbell",
    appBehavior: `For home workouts, the total dumbbell load is set to ${pct(DUMBBELL_LOAD_FACTOR)} of the barbell weight, split between two hands and rounded to 5 lb. If that is more than your heaviest dumbbells, the app picks the next exercise that fits, or caps the weight. Presses and rows are marked high confidence; squat and deadlift substitutes medium.`,
    rationale:
      "Measured directly, dumbbell bench press 1RM was about 17% below barbell bench press 1RM, because dumbbells are harder to stabilise.",
    caveat:
      "That study covers the bench press only. No research gives a conversion for squats or deadlifts, which is why those substitutes are marked medium confidence.",
    strength: "moderate",
    sources: ["saeterbakken2011"],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/dbConversion.ts#barbellToDumbbell",
      "src/lib/autoAdapt.ts#adaptExerciseForHome",
    ],
    surfaces: ["src/app/workout/configure/page.tsx"],
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
