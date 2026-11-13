import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";
import { STALL_BAND_PERCENT } from "@/lib/rateOfLoss";

export const NUTRITION_RULES = {
  "rate-of-loss": {
    area: "nutrition",
    status: "active",
    title: "How fast should I lose weight?",
    summary: "Losing 0.5–1% of bodyweight a week protects muscle",
    appBehavior: `While cutting, a weekly loss of 0.5–1.0% of bodyweight is on pace, 0.25–0.5% or 1.0–1.5% yellow, above 1.5% red, and a change of less than ${STALL_BAND_PERCENT}% either way a stall. A gain of ${STALL_BAND_PERCENT}% or more is reported as weight going up, not as a stall. Several weigh-ins on one day count as one day (their average). The Body tab labels your rate of change on pace, slow or fast, and the bodyweight page shades the target band on the weekly rate chart. While cutting, Today says when the rate is on pace, faster or slower than the target, or when weight is going up.`,
    rationale:
      "A review for physique athletes recommends losing 0.5–1% of bodyweight per week to retain muscle while dieting.",
    strength: "moderate",
    sources: ["helms2014"],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/rateOfLoss.ts#calculateWeeklyRateOfLoss"],
    surfaces: [
      "src/components/Progress/BodyTab.tsx",
      "src/components/Progress/body/BodyDetail.tsx",
      "src/components/Today/AttentionList.tsx",
    ],
  },
  "fat-loss-stall": {
    area: "nutrition",
    status: "active",
    title: "What should I do when weight loss stalls?",
    summary: "Wait about three weeks before treating a slow patch as a stall",
    appBehavior: `While cutting, Today reports a stall only when two things hold: this week's 7-day average is less than 0.3 lb below last week's, and your weekly rate has stayed under ${STALL_BAND_PERCENT}% of bodyweight for about three weeks. It then suggests adding daily steps first, and a small cut in calories only after five weeks. Several weigh-ins on one day count as one day (their average). The app does not prescribe a diet break; taking one is your choice.`,
    rationale:
      "Week-to-week weight is noisy. In a 12-week trial with resistance-trained adults, week-long diet breaks did not improve fat loss or muscle retention, so a diet break is a comfort choice rather than a fix.",
    strength: "limited",
    sources: ["peos2021"],
    reviewedOn: "2026-11",
    implementedIn: [
      "src/lib/stallDetection.ts#detectFatLossStall",
      "src/lib/insights/rules/fatLossStall.ts#fatLossStallInsights",
    ],
    surfaces: ["src/components/Today/AttentionList.tsx"],
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
