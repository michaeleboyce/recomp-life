import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";

export const NUTRITION_RULES = {
  "rate-of-loss": {
    area: "nutrition",
    status: "planned",
    title: "How fast should I lose weight?",
    summary: "Losing 0.5–1% of bodyweight a week protects muscle",
    appBehavior:
      "Rule in code: a weekly loss of 0.5–1.0% of bodyweight is green, 0.25–0.5% or 1.0–1.5% yellow, above 1.5% red, and below 0.25% a stall. It is not connected to a screen yet.",
    rationale:
      "A review for physique athletes recommends losing 0.5–1% of bodyweight per week to retain muscle while dieting.",
    strength: "moderate",
    sources: ["helms2014"],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/rateOfLoss.ts#calculateWeeklyRateOfLoss"],
    surfaces: [],
    activationNotes: "Ready to connect to the bodyweight trend.",
  },
  "fat-loss-stall": {
    area: "nutrition",
    status: "planned",
    title: "What should I do when weight loss stalls?",
    summary: "Wait about three weeks before treating a slow patch as a stall",
    appBehavior:
      "Rule in code: flag a stall when this week's 7-day average is less than 0.3 lb below last week's, and suggest re-checking intake, adding cardio or taking a diet break. The chart that would show it is not on any screen.",
    rationale:
      "Week-to-week weight is noisy. In a 12-week trial with resistance-trained adults, week-long diet breaks did not improve fat loss or muscle retention, so a diet break is a comfort choice rather than a fix.",
    strength: "limited",
    sources: ["peos2021"],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/stallDetection.ts#detectFatLossStall"],
    surfaces: [],
    activationNotes:
      "Require about three slow weeks before flagging (the rule in rateOfLoss.ts already does) and present the diet break as optional.",
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
