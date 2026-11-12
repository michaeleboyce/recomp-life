/**
 * Research-driven changes to coaching rules, newest first.
 *
 * Add an entry whenever a rule's behaviour changes because of evidence. It is
 * shown to users on the research page ("Updates") and in docs/coaching-rules.md.
 */

import type { EvidenceChange } from "@/types";
import type { RuleId } from "./rules";
import type { SourceId } from "./sources";

export const EVIDENCE_CHANGELOG: ReadonlyArray<EvidenceChange<RuleId, SourceId>> = [
  {
    date: "2026-11-12",
    ruleId: "projection-dose-response",
    change:
      "New projection screen for each lift: see where your estimated 1RM is heading and try alternatives (sessions, sets, other work for the same muscles, sessions passed, phase). Alternatives further from what you do now get a wider range.",
    sources: ["pelland2026", "grgic2018frequency"],
  },
  {
    date: "2026-11-12",
    ruleId: "projection-rate-of-gain",
    change:
      "The projection range now never assumes less scatter than about 2% of your estimate, so a very steady history no longer shows a range of zero.",
    sources: ["grgic2020", "nuzzo2024"],
  },
  {
    date: "2026-11-11",
    ruleId: "activity-fatigue",
    change:
      "Yoga, cycling, hiking and walking can now be logged. A hard one in the last 24 hours shows a note before your next workout; it never changes weights or progression.",
    sources: [],
  },
  {
    date: "2026-11-11",
    ruleId: "time-off",
    change:
      "A lift now counts as a long break after 21 days instead of 7, and suggested weight cuts after time off were reduced from 10–40% to 5–15%.",
    sources: ["spiering2021", "halonen2024"],
  },
  {
    date: "2026-11-11",
    ruleId: "amrap-effort",
    change:
      "T1 AMRAP sets now ask you to stop about 1 rep short of failure in every phase, not only while cutting.",
    sources: ["robinson2024", "moranNavarro2017"],
  },
  {
    date: "2026-11-11",
    ruleId: "e1rm-estimate",
    change:
      "Estimated 1RM now accounts for logged RPE and uses only T1 sets of 10 reps or fewer. The trend arrow was also corrected: it had been reading the history backwards.",
    sources: ["nuzzo2024", "halperin2022"],
  },
  {
    date: "2026-11-11",
    ruleId: "rest-light",
    change: "Rest after T3 and accessory sets was raised from 60 to 90 seconds.",
    sources: ["singer2024"],
  },
  {
    date: "2026-11-11",
    ruleId: "run-interference",
    change:
      "The strong run advisory now applies only within 6 hours of a hard run, and suggests a lighter T1 instead of resting.",
    sources: ["robineau2016", "markov2021"],
  },
  {
    date: "2026-11-11",
    ruleId: "accessories-in-cut",
    change:
      "The accessory cap while cutting was raised from 2 to 3, to match maintaining.",
    sources: ["roth2022"],
  },
];
