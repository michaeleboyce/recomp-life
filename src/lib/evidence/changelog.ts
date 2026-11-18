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
    date: "2026-11-18",
    ruleId: "accessory-selection",
    change:
      "An accessory offered at home in place of a gym one used to give the replacement as its reason (\"At home instead of Machine Chest Fly\"). It now gives the reason it earned itself, as every other pick does, and the accessory sheet names the gym exercise it stands in for as a quieter note below.",
    sources: [],
  },
  {
    date: "2026-11-18",
    ruleId: "swap-recommendation",
    change:
      "Switched on: the swap sheet shows the recommended swaps before and during a workout, each with its weight, sets and reps, reason, history and score parts, pairs that cover an exercise together, and what the swap does to the program lift. A swap is for that workout only unless \"Every time\" is switched on, which marks the replacement preferred at that location (and, for an accessory, leaves the original out there). At home without a bench, exercises that need one are no longer offered. An exercise added in place of a program lift (the second of a pair, or after sets of the lift were logged) is logged only: it is not judged as an accessory and does not count as an accessory session for its next weight.",
    sources: [],
  },
  {
    date: "2026-11-18",
    ruleId: "swap-recommendation",
    change:
      "New rule: swaps are ranked by a score in parts (muscles covered, same movement or tier fit, preferred, done before, a known weight, recovery and pain), each with the weight, sets and reps it would be done at, and pairs are offered when no single exercise covers the original. The Edit workout sheet's swap list now follows this order (same movement first, preferred no longer always first).",
    sources: [],
  },
  {
    date: "2026-11-18",
    ruleId: "session-length-budget",
    change:
      "New: a session length to plan for (60 minutes until you choose, or no limit), in Settings or for one workout on the Ready screen. The accessories chosen for a workout are kept to it, best first; the main lifts are never shortened and pinned accessories are always kept. The accessory sheet says how many fit and lists the ones left out, each with \"Add anyway\".",
    sources: [],
  },
  {
    date: "2026-11-18",
    ruleId: "time-off",
    change:
      "The days-off note on Today now counts sessions imported from other apps: training logged elsewhere is not time off.",
    sources: [],
  },
  {
    date: "2026-11-18",
    ruleId: "recovery-windows",
    change:
      "The Strength tab's recovery rows now count sessions imported from other apps: a lift was last trained at its latest session of either kind.",
    sources: [],
  },
  {
    date: "2026-11-18",
    ruleId: "weekly-volume",
    change:
      "The weekly review now counts sessions imported from other apps in its sessions, each lift's sessions, hard sets per muscle group and tonnage, and says how many were imported. New bests, effort and readiness stay the app's own.",
    sources: [],
  },
  {
    date: "2026-11-18",
    ruleId: "e1rm-estimate",
    change:
      "The \"estimated 1RM down\" note now also reads the estimates of sessions imported from other apps after the lift's last session in the app.",
    sources: [],
  },
  {
    date: "2026-11-18",
    ruleId: "strength-pooling",
    change:
      "One number per lift: the Strength tab's lift cards and Today's lift tiles now show the plan's estimate, the same number as the lift page headline, with the change of the same smooth line. They had shown the latest session's own estimate.",
    sources: [],
  },
  {
    date: "2026-11-18",
    ruleId: "effort-logging",
    change:
      "The effort rating is now one optional question, \"How many more reps could you have done?\", with three answers (0, 1-2 or 3+), in place of a 6 to 10 effort score. Self-ratings are off by about one rep on average, so finer answers would not be more accurate.",
    sources: ["halperin2022"],
  },
  {
    date: "2026-11-18",
    ruleId: "t2-autoregulation",
    change:
      "The lighter-weight suggestion now reads the first T2 set's reps left. Nothing left suggests a 7.5% drop (never less than one 5 lb step) in every phase, down from 10%; while cutting, 1-2 left suggests one 5 lb step down, in place of a 5% drop, and now also appears at 2 reps left. While maintaining, \"maybe one more rep\" no longer brings a suggestion. The drops were made smaller as a deliberate choice, not because of new research; the sizes and the split by phase are graded as coaching heuristics.",
    sources: [],
  },
  {
    date: "2026-11-18",
    ruleId: "e1rm-estimate",
    change:
      "The reps added for effort before the formula are now 0, 1.5 or 3 for the answers 0, 1-2 and 3+, in place of 10 minus the effort score (up to 4). An estimate from a 3+ set is a lower bound.",
    sources: [],
  },
  {
    date: "2026-11-18",
    ruleId: "amrap-effort",
    change:
      "The last T1 set now asks you to stop with 1-2 reps left, in the same words as the effort question, in place of about 1 rep left on the old effort score.",
    sources: [],
  },
  {
    date: "2026-11-18",
    ruleId: "import-effort-words",
    change:
      "Effort words from other apps now map to an answer for reps left in place of an effort score: Max, Failure and Failed to 0; Ideal, Moderate and Hard to 1-2; Easy to 3+. A set with no word is still read as taken to its limit.",
    sources: [],
  },
  {
    date: "2026-11-18",
    ruleId: "t3-progression",
    change:
      "T3 weight used to go up when the last set reached a flat 25 reps, for every exercise. It now goes up when the last set shows you could still do the target reps at the next weight, by the app's rep formula: 18 to 25 reps depending on the size of the step (for example 18 for a 120 lb pulldown going up 5 lb, 24 for a 25 lb dumbbell). The threshold is graded heuristic; past sessions are re-read under it. The exercise page, the workout's last T3 set, What it did and the why sheet show each exercise's own number.",
    sources: [],
  },
  {
    date: "2026-11-17",
    ruleId: "accessory-selection",
    change:
      "Switched on: every workout now comes with accessories chosen by this rule (the setting can be changed to \"ask me\" or \"none\"). Today and the Ready screen list them under the main lifts with a reason each; the why sheet shows every part of the score; the accessory sheet changes, swaps, adds or pins them.",
    sources: [],
  },
  {
    date: "2026-11-17",
    ruleId: "accessory-progression",
    change:
      "Switched on: each accessory is planned at the weight double progression gives (or one set by hand, or a first weight from your history), the workout shows its rep range, and after its last set, the summary and the Log say what it does next time and why.",
    sources: [],
  },
  {
    date: "2026-11-17",
    ruleId: "cap-progression",
    change:
      "A workout keeps the home weight it started with: when the heaviest dumbbell or the dumbbell step is changed after it started, resuming it shows the weight it recorded with a note, the weight can still be changed for the set, and finishing it judges the sets against that weight instead of the new limit.",
    sources: [],
  },
  {
    date: "2026-11-17",
    ruleId: "import-effort-words",
    change:
      "Switched on: an imported session's detail, opened from the Log or a lift's session list, shows each set's effort word with the effort it is read as.",
    sources: [],
  },
  {
    date: "2026-11-17",
    ruleId: "strength-pooling",
    change:
      "Sessions imported from another app now feed every plan, not only the muscle view and the starting-weight suggestions: a home exercise's first weight, re-entry and the learned ratios read them, by the same rules and with the same halving for age. They still never change the workout order or the progression. The lift page shows them, marked as imported, and cites this rule.",
    sources: [],
  },
  {
    date: "2026-11-17",
    ruleId: "transfer-ratio",
    change:
      "A ratio is now also learned from imported pairs: an imported dumbbell session and an imported barbell session of the same lift close enough in time count like your own.",
    sources: ["saeterbakken2011", "saeterbakken2013", "speirs2016"],
  },
  {
    date: "2026-11-17",
    ruleId: "home-progression",
    change:
      "A home exercise you have not done in the app starts from an estimate that includes your imported history, and Today names its latest imported session (\"From your history: last 45 × 10 on Nov 3\") instead of \"First time\".",
    sources: [],
  },
  {
    date: "2026-11-17",
    ruleId: "e1rm-estimate",
    change:
      "Imported sets are estimated by the same formula and shown on the lift pages, the projection, the Strength tab and Today, marked as imported; a best among them is shown as history (\"Best before ReComp\") and never as a new best.",
    sources: [],
  },
  {
    date: "2026-11-16",
    ruleId: "home-progression",
    change:
      "Switched on: the home lift page cites it for a home exercise's own weight, and the Log's \"What it did\" and the workout summary cite it for a home session's outcome instead of the plain GZCLP rule.",
    sources: [],
  },
  {
    date: "2026-11-16",
    ruleId: "cap-progression",
    change:
      "Switched on: Today shows it on a home lift held at your heaviest dumbbell, beside what a pass does there; the home lift page, \"What it did\" and the workout summary cite it when the cap policy acted.",
    sources: [],
  },
  {
    date: "2026-11-16",
    ruleId: "transfer-ratio",
    change:
      "Switched on: the home lift page cites it for a home exercise's first weight, and the import screen for the home starting weights it suggests.",
    sources: ["saeterbakken2011", "saeterbakken2013", "speirs2016"],
  },
  {
    date: "2026-11-16",
    ruleId: "drop-set-evidence",
    change:
      "Switched on: the drop set screen in a workout shows how a drop counts. The rule now also states the weight a drop starts at (about a fifth lighter), read from the code.",
    sources: ["havers2026", "sodal2023"],
  },
  {
    date: "2026-11-16",
    ruleId: "starting-weights",
    change:
      "Added: after an import, each program lift the history informs gets a suggested starting weight from its strength estimate (T1 at the GZCLP guide's share of a five-rep max), shown with its working and used only once you confirm it.",
    sources: [],
  },
  {
    date: "2026-11-16",
    ruleId: "import-effort-words",
    change:
      "Added as a planned rule (not active yet): effort words in another app's export (Easy, Ideal, Hard and others) are read as an approximate effort rating when imported sets feed the strength estimate.",
    sources: [],
  },
  {
    date: "2026-11-16",
    ruleId: "strength-pooling",
    change:
      "Switched on: the Muscles tab shows a strength trend for each muscle from every exercise that works it, barbell and home, a primary muscle at full weight and a secondary one at half. It is an index starting at 100, not a weight.",
    sources: [],
  },
  {
    date: "2026-11-16",
    ruleId: "home-progression",
    change:
      "Added: a home session now moves its own exercise's weight (in dumbbell steps) and no longer raises the barbell weight, which moves when you are back at the gym; before, a home pass raised the barbell weight. It still counts for the rotation and as evidence for the lift.",
    sources: [],
  },
  {
    date: "2026-11-16",
    ruleId: "cap-progression",
    change:
      "Added as a planned rule (not active yet): at your heaviest dumbbell, a pass moves to a harder exercise at a load no lighter, or adds reps, instead of stalling.",
    sources: [],
  },
  {
    date: "2026-11-16",
    ruleId: "dumbbell-conversion",
    change:
      "Fixed: converting a dumbbell weight back to the barbell now divides by 0.8 (the inverse of the barbell-to-dumbbell conversion) instead of multiplying by 1.2, so a weight converted there and back lands where it began.",
    sources: ["saeterbakken2011"],
  },
  {
    date: "2026-11-16",
    ruleId: "transfer-ratio",
    change:
      "Changed (when switched on): a home exercise's first weight comes from its own starting ratio to the barbell lift, and later from your own pairs, instead of a flat 80% of the barbell weight for every exercise.",
    sources: ["saeterbakken2011", "saeterbakken2013", "speirs2016"],
  },
  {
    date: "2026-11-16",
    ruleId: "transfer-ratio",
    change:
      "Added as a planned rule (not active yet): each home exercise gets a starting ratio to its barbell lift, from a study where one exists, and learns your own ratio from home and gym sessions done close together.",
    sources: ["saeterbakken2011", "saeterbakken2013", "speirs2016"],
  },
  {
    date: "2026-11-16",
    ruleId: "strength-pooling",
    change:
      "Added as a planned rule (not active yet): barbell and home sessions pool into one strength estimate per lift, with home sessions counting less, which will set the first weight back at the gym or at home.",
    sources: [],
  },
  {
    date: "2026-11-16",
    ruleId: "drop-set-evidence",
    change:
      "Added as a planned rule (not active yet): drops count as half a set of volume, at most one extra set per working set, and as a small, fatigue-adjusted part of the strength estimate; they never make a new best.",
    sources: ["havers2026", "sodal2023"],
  },
  {
    date: "2026-11-15",
    ruleId: "forecast-stall",
    change:
      "Introduced: Forecasts now shows the chance that each main lift misses at its current stage within its next two sessions, read from the rep forecast, and checks it against those sessions.",
    sources: [],
  },
  {
    date: "2026-11-15",
    ruleId: "forecast-milestone",
    change:
      "Introduced: Forecasts now dates when each main lift's working weight reaches its next multiple of 25 lb, with a range, by walking the program's own rules forward, and checks it against the first workout at that weight.",
    sources: [],
  },
  {
    date: "2026-11-15",
    ruleId: "forecast-muscle-ready",
    change:
      "Introduced: Forecasts now shows when the muscles of your last workout should be ready again, from the recovery times. It is an explanation and is not scored, because the log never records when a muscle has recovered.",
    sources: [],
  },
  {
    date: "2026-11-15",
    ruleId: "forecast-bodyweight",
    change:
      "Now shown: the Forecasts screen lists the stored bodyweight forecast for four weeks on, with its range and how it was worked out.",
    sources: [],
  },
  {
    date: "2026-11-15",
    ruleId: "forecast-calibration",
    change:
      "Now shown: the Track record screen scores every stored forecast against what happened, and the app widens a kind's ranges when too few results land inside them.",
    sources: [],
  },
  {
    date: "2026-11-15",
    ruleId: "forecast-session-length",
    change:
      "Introduced: Today now shows how long the workout is expected to take, as a number of minutes with a range, from the planned sets and rests and corrected by how long your own sessions have run.",
    sources: [],
  },
  {
    date: "2026-11-15",
    ruleId: "forecast-reps",
    change:
      "Introduced: Today now shows the chance that this workout sets a new best estimated max, worked out from your recent last sets and how much they vary.",
    sources: [],
  },
  {
    date: "2026-11-15",
    ruleId: "readiness-score",
    change:
      "Introduced: Today now shows a readiness score built from sleep, stress, rest, recent activity and soreness, measured against your own usual level.",
    sources: [],
  },
  {
    date: "2026-11-14",
    ruleId: "off-program-credit",
    change:
      "A lift done heavier than prescribed in every set now progresses from the heavier weight instead of the prescribed one. Missing reps at a heavier weight is not counted as a failure.",
    sources: [],
  },
  {
    date: "2026-11-13",
    ruleId: "t3-progression",
    change:
      "T3 weight now goes up only when the last set reaches 25 reps, in every phase. Outside a cut it used to go up on 50 total reps as well; that route is removed.",
    sources: [],
  },
  {
    date: "2026-11-12",
    ruleId: "off-program-credit",
    change:
      "You can now change a workout before starting it. Each lift you change says whether it still counts toward progression or is only logged, and a lift you skip keeps its weight.",
    sources: [],
  },
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
      "Today now shows a fatigue sign when a lift's estimated 1RM falls several sessions in a row. Only that trend is used (not effort ratings or the reps on the last set, taken to as many as you can), and an easier week is offered as optional.",
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
      "On a T1 lift, the last set, taken to as many reps as you can, now asks you to stop about 1 rep short of failure in every phase, not only while cutting.",
    sources: ["robinson2024", "moranNavarro2017"],
  },
  {
    date: "2026-11-11",
    ruleId: "e1rm-estimate",
    change:
      "Estimated 1RM now accounts for a logged effort rating and uses only T1 sets of 10 reps or fewer. The trend arrow was also corrected: it had been reading the history backwards.",
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
  {
    date: "2026-11-13",
    ruleId: "run-interference",
    change:
      "Runs can now be imported from Apple Health. An imported run has no effort rating and is ignored by this rule until you rate it.",
    sources: [],
  },
  {
    date: "2026-11-13",
    ruleId: "activity-fatigue",
    change:
      "Sessions can now be imported from Apple Health. An imported session has no effort rating and is ignored by this rule until you rate it.",
    sources: [],
  },
  {
    date: "2026-11-13",
    ruleId: "readiness",
    change:
      "The sleep answer can now be filled in from Apple Health's record of last night; you can still change it. The suggestion itself is unchanged.",
    sources: [],
  },
  {
    date: "2026-11-15",
    ruleId: "gzclp-progression",
    change:
      "The deadlift and its home substitutes now count as lower-body lifts, so a pass adds the lower-body step. They had been adding the smaller upper-body step.",
    sources: [],
  },
  {
    date: "2026-11-17",
    ruleId: "target-evidence",
    change:
      "New rule. A home weight you set yourself is kept beside the app's own weight, and until you lift it, it counts at half a logged home session toward the barbell lift's strength estimate.",
    sources: [],
  },
  {
    date: "2026-11-17",
    ruleId: "strength-pooling",
    change:
      "A set logged at no weight no longer counts as a session's estimate. It had counted as a max of 0, which pulled the lift's estimate down and could bring the first gym weight after time at home down to the empty bar.",
    sources: [],
  },
  {
    date: "2026-11-17",
    ruleId: "home-progression",
    change:
      "A home exercise's first weight now comes from its own sets of the last 8 weeks (app or imported) when it has them, never more than one dumbbell step above the heaviest weight lifted in them. It had always come from the barbell lift's estimate, which could plan twice what the exercise was last done at. Today names the session only when it set the weight, and says \"Last done\" instead of \"First time\" for an exercise done before.",
    sources: [],
  },
  {
    date: "2026-11-17",
    ruleId: "accessory-selection",
    change:
      "New rule, not yet shown. How the app will choose a workout's accessories by default: pins, preferences, habit, this week's shortfall, fit with the day, recovery and spread, each with a named weight. Graded heuristic.",
    sources: [],
  },
  {
    date: "2026-11-17",
    ruleId: "transfer-ratio",
    change:
      "A home exercise with no recent sets of its own now starts from the barbell lift's estimate through the ratio learned from your pairs when there are any. It had always used the starting ratio, and an exercise with no starting ratio used the flat conversion even when pairs gave a ratio.",
    sources: [],
  },
  {
    date: "2026-11-17",
    ruleId: "strength-pooling",
    change:
      "The estimated-max chart now draws one smooth line (the estimate as of each session, with the pooling weights and a one-standard-deviation band) over every session that feeds it, by source: the lift, imported sessions and related exercises through their ratios. The big number is the plan's own estimate, with a line saying why it differs from the smooth line. Smoothing (light, standard, heavy) and switching sources off change the line only, never a planned weight. Each muscle's strength trend opens the same chart, and the Strength tab's total adds the lifts' lines.",
    sources: [],
  },
  {
    date: "2026-11-17",
    ruleId: "accessory-progression",
    change:
      "The step for dumbbell accessories is now the dumbbell increment instead of 5 lb, a weight set by hand wins until the exercise is next logged, and a first weight can come from the exercise's own history (capped at the heaviest weight lifted plus one step). Still not shown.",
    sources: [],
  },
];
