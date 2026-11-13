import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";
import { T1_AMRAP_TARGET_RPE } from "@/lib/amrap";
import { T2_AUTOREG_RPE_THRESHOLD, T2_AUTOREG_DROP } from "@/lib/progression";
import { E1RM_MAX_REPS, E1RM_MAX_REPS_IN_RESERVE } from "@/lib/e1rm";

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;

export const EFFORT_RULES = {
  "amrap-effort": {
    area: "effort",
    status: "active",
    title: "How hard should the last set be?",
    summary: "Heavy sets: stop 1 rep short. Lighter sets: go close to failure",
    appBehavior: `On the last T1 set the app asks you to stop with about 1 rep left (RPE ${T1_AMRAP_TARGET_RPE}). On the last T3 set it asks you to push close to failure.`,
    rationale:
      "Strength gains are similar whether heavy sets stop short of failure or reach it, and sets taken to failure take a day or two longer to recover from. Muscle growth does benefit from getting close to failure, which is why the lighter T3 sets are pushed harder.",
    caveat:
      "People tend to have about one more rep left than they think, so an honest RPE 9 is already a hard set.",
    strength: "moderate",
    sources: ["robinson2024", "acsm2026", "moranNavarro2017"],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/amrap.ts#getAMRAPGuidance"],
    surfaces: ["src/components/ActiveWorkout/AMRAPIndicator.tsx"],
  },
  "rpe-logging": {
    area: "effort",
    status: "active",
    title: "Why log RPE?",
    summary: "RPE lets the app adjust for how hard the set really was",
    appBehavior:
      "RPE (how hard a set felt, from 6 to 10) is optional. When logged, it is used to suggest lighter T2 sets after a very hard first set, and to adjust your estimated 1RM for reps you had left.",
    rationale:
      "Effort ratings are accurate enough to be useful: on average people are off by about one rep, and they are most accurate close to failure and in sets of 12 reps or fewer.",
    caveat:
      "Ratings on high-rep sets are less reliable, so the app only acts on RPE for T1 and T2 sets.",
    strength: "moderate",
    sources: ["halperin2022"],
    reviewedOn: "2026-11",
    implementedIn: ["src/components/ActiveWorkout/RPESelector.tsx#RPESelector"],
    surfaces: ["src/components/ActiveWorkout/RPESelector.tsx"],
  },
  "t2-autoregulation": {
    area: "effort",
    status: "active",
    title: "Why is the app suggesting a lighter weight?",
    summary: "A very hard first set means the planned load is too heavy today",
    appBehavior: `If the first T2 set is rated RPE ${T2_AUTOREG_RPE_THRESHOLD.cutting} or higher while cutting (${T2_AUTOREG_RPE_THRESHOLD.maintaining} while maintaining, ${T2_AUTOREG_RPE_THRESHOLD.bulking} while bulking), the app suggests dropping ${pct(T2_AUTOREG_DROP.standard)} for the remaining sets, or ${pct(T2_AUTOREG_DROP.max)} after an RPE 10 set. Accepting freezes T2 progression for that session; it is not counted as a failure.`,
    rationale:
      "Adjusting load to how the session is actually going produced larger strength gains than sticking to fixed loads in a meta-analysis of 8 studies. Effort ratings are most accurate in exactly this situation: close to failure, in sets of 12 reps or fewer.",
    caveat:
      "The different thresholds per phase are a coaching heuristic. The studies were small and short.",
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
    appBehavior: `Uses the Epley formula (weight × (1 + reps ÷ 30)) on T1 AMRAP sets of ${E1RM_MAX_REPS} reps or fewer. If you log an RPE, the reps you had left are added first (up to ${E1RM_MAX_REPS_IN_RESERVE}). The trend arrow compares your last 3 estimates. Today reports a new best estimate from the last 7 days, and notes when a lift's last three estimates have fallen.`,
    rationale:
      "No formula fits everyone: the reps possible at a given percentage of 1RM differ between exercises and between people, and estimates get worse as reps climb. Within one lift the same formula still tracks change well, so the trend is more trustworthy than the number.",
    caveat: "Treat the figure as an estimate, not a tested max.",
    strength: "limited",
    sources: ["nuzzo2024", "halperin2022"],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/e1rm.ts#calculateE1RM"],
    surfaces: [
      "src/app/1rm-calculator/page.tsx",
      "src/components/Lift/PrLine.tsx",
      "src/components/Today/AttentionList.tsx",
    ],
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
