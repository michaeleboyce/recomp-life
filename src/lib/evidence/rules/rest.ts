import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";
import {
  REST_SECONDS,
  CUTTING_REST_BONUS_SECONDS,
  formatRestDuration,
} from "@/lib/restTimes";

export const REST_RULES = {
  "rest-heavy": {
    area: "rest",
    status: "active",
    title: "Why rest this long after heavy sets?",
    summary: "Heavy sets need 2+ minutes of rest to keep strength gains coming",
    appBehavior: `Rests ${formatRestDuration(REST_SECONDS.T1)} after T1 sets and ${formatRestDuration(REST_SECONDS.T2)} after T2 sets. You can add 30 seconds or skip at any time.`,
    rationale:
      "A systematic review of 23 studies found trained lifters appear to need more than 2 minutes between sets to maximise strength gains. For muscle growth, resting longer than 60 seconds gives a small benefit.",
    caveat:
      "Rest needs vary. If you feel ready sooner, going early is fine; after a very hard set, take longer.",
    strength: "moderate",
    sources: ["grgic2018", "singer2024"],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/restTimes.ts#getRestSeconds"],
    surfaces: ["src/components/ActiveWorkout/RestTimer.tsx"],
  },
  "rest-light": {
    area: "rest",
    status: "active",
    title: `Why ${REST_SECONDS.T3} seconds after lighter sets?`,
    summary: "Resting over 60 seconds gives slightly better muscle growth",
    appBehavior: `Rests ${formatRestDuration(REST_SECONDS.T3)} after T3 sets and ${formatRestDuration(REST_SECONDS.accessory)} after accessory sets.`,
    rationale:
      "A meta-analysis of 9 studies found a small muscle-growth benefit from resting longer than 60 seconds between sets, with no further benefit detectable beyond 90 seconds. This gets that benefit without stretching the session.",
    strength: "moderate",
    sources: ["singer2024"],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/restTimes.ts#getRestSeconds"],
    surfaces: ["src/components/ActiveWorkout/RestTimer.tsx"],
  },
  "rest-cut-bonus": {
    area: "rest",
    status: "active",
    title: `Why ${CUTTING_REST_BONUS_SECONDS} seconds extra while cutting?`,
    summary: "Extra rest on heavy sets while cutting is a cautious convention",
    appBehavior: `While your phase is set to cutting, ${CUTTING_REST_BONUS_SECONDS} seconds is added to T1 and T2 rest.`,
    rationale:
      "The idea is that recovery between sets is a little slower in a calorie deficit, so heavy sets get slightly more rest to protect performance.",
    caveat:
      "No study has tested this directly. Skip the extra time if you feel ready.",
    strength: "heuristic",
    sources: [],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/restTimes.ts#getRestSeconds"],
    surfaces: ["src/components/ActiveWorkout/RestTimer.tsx"],
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
