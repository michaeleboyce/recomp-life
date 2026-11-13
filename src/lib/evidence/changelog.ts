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
    ruleId: "t3-progression",
    change:
      "The T3 rule is now shown: each workout's page says whether its T3 lift went up (and why) or stays at the same weight, as of that workout. The rule itself is unchanged.",
    sources: [],
  },
  {
    date: "2026-11-12",
    ruleId: "gzclp-progression",
    change:
      "Logged sessions can now be edited or deleted. Doing so re-runs progression from the log, so the next workout follows the corrected history; sessions logged later are kept as they were lifted.",
    sources: [],
  },
  {
    date: "2026-11-12",
    ruleId: "fatigue-detection",
    change:
      "Today now shows a fatigue sign when a lift's estimated 1RM falls several sessions in a row. Only that trend is used (not RPE or AMRAP reps), and an easier week is offered as optional.",
    sources: [],
  },
  {
    date: "2026-11-12",
    ruleId: "fat-loss-stall",
    change:
      "Today now reports a weight-loss stall while cutting, but only after about three slow weeks, and suggests more daily steps before any cut in calories.",
    sources: [],
  },
  {
    date: "2026-11-12",
    ruleId: "projection-rate-of-gain",
    change:
      "Projections are more cautious: the range now includes how uncertain your rate of gain is (much wider from only a few results), horizons longer than your history are marked unreliable, and after a break the projection starts from your last result instead of extending the trend across the gap.",
    sources: [],
  },
  {
    date: "2026-11-12",
    ruleId: "projection-dose-response",
    change:
      "An alternative with no sets and no sessions of the lift no longer projects a gain.",
    sources: [],
  },
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
    ruleId: "rate-of-loss",
    change:
      "Gaining 0.25% of bodyweight or more a week is now reported as weight going up instead of as a stall, and several weigh-ins on one day now count as one day.",
    sources: [],
  },
  {
    date: "2026-11-11",
    ruleId: "fat-loss-stall",
    change:
      "The stall check now averages several weigh-ins on one day into one, so a second weigh-in no longer shifts the weekly comparison.",
    sources: [],
  },
  {
    date: "2026-11-11",
    ruleId: "t3-progression",
    change:
      "T3 weight now goes up by 5 lb after a fully completed T3 exercise whose last set reached 25 reps. The rule existed but was never applied, so T3 weight only changed when edited by hand.",
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
