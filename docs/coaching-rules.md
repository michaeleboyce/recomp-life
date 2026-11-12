<!-- GENERATED FILE. Do not edit by hand. Source: src/lib/evidence. Regenerate with `npm run docs:evidence`. -->

# Coaching rules and research

Every coaching rule in ReComp Life: what the app does, why, how strong the research is, where the rule lives in the code and where it is shown. The same content appears in the app under Tools > How the App Coaches.

23 active rules, 7 planned rules, 32 sources. Last reviewed against the research: November 2026.

To add or change research, follow [research/ADDING_RESEARCH.md](research/ADDING_RESEARCH.md).

## How to read the evidence grades

| Grade | Meaning |
|---|---|
| Strong evidence | A position stand or several agreeing meta-analyses address this rule directly. |
| Moderate evidence | One meta-analysis or several trials support it, or strong evidence is applied indirectly. |
| Limited evidence | Small or beginner-only studies, or the direction is supported but the exact number is a judgment call. |
| Coaching heuristic | No direct research. A common coaching convention. |
| Program rule | Defined by the GZCLP program, not by research. |

Most training studies last 8 to 12 weeks and many use people new to lifting, so even well-supported rules are averages. Every suggestion in the app can be overridden. This is training guidance, not medical advice.

## Summary

| Rule | Area | Status | Evidence | Sources |
|---|---|---|---|---|
| `tier-structure` | Program and progression | Active | Strong evidence | ACSM 2026, Pelland 2026 |
| `gzclp-progression` | Program and progression | Active | Program rule | none |
| `t3-progression` | Program and progression | Planned | Program rule | Robinson 2024, Halperin 2022 |
| `accessory-progression` | Program and progression | Planned | Moderate evidence | Robinson 2024 |
| `amrap-effort` | Effort and estimates | Active | Moderate evidence | Robinson 2024, ACSM 2026, Morán-Navarro 2017 |
| `rpe-logging` | Effort and estimates | Active | Moderate evidence | Halperin 2022 |
| `t2-autoregulation` | Effort and estimates | Active | Moderate evidence | Zhang 2021, Halperin 2022 |
| `e1rm-estimate` | Effort and estimates | Active | Limited evidence | Nuzzo 2024, Halperin 2022 |
| `rest-heavy` | Rest between sets | Active | Moderate evidence | Grgic 2018, Singer 2024 |
| `rest-light` | Rest between sets | Active | Moderate evidence | Singer 2024 |
| `rest-cut-bonus` | Rest between sets | Active | Coaching heuristic | none |
| `recovery-windows` | Recovery and time off | Active | Limited evidence | Morán-Navarro 2017, Stults-Kolehmainen 2014 |
| `time-off` | Recovery and time off | Active | Limited evidence | Spiering 2021, Halonen 2024, Bosquet 2013 |
| `readiness` | Recovery and time off | Active | Moderate evidence | Craven 2022, Stults-Kolehmainen 2014 |
| `deload` | Recovery and time off | Planned | Limited evidence | Coleman 2024, Pancar 2026, Spiering 2021 |
| `activity-fatigue` | Recovery and time off | Active | Coaching heuristic | none |
| `fatigue-detection` | Recovery and time off | Planned | Coaching heuristic | none |
| `run-interference` | Running | Active | Moderate evidence | Robineau 2016, Markov 2021, Schumann 2022 |
| `weekly-volume` | Training volume | Active | Moderate evidence | Pelland 2026, Roth 2022 |
| `accessories-in-cut` | Training volume | Active | Limited evidence | Roth 2022, Murphy & Koehler 2022 |
| `volume-ratio` | Training volume | Planned | Coaching heuristic | none |
| `rate-of-loss` | Fat loss | Active | Moderate evidence | Helms 2014 |
| `fat-loss-stall` | Fat loss | Planned | Limited evidence | Peos 2021 |
| `projection-dose-response` | Strength projections | Active | Limited evidence | Pelland 2026, Grgic 2018b, ACSM 2026 |
| `projection-specificity` | Strength projections | Active | Limited evidence | Pelland 2026, Saeterbakken 2025, Mattocks 2017 |
| `projection-rate-of-gain` | Strength projections | Active | Limited evidence | Steele 2023, Latella 2020, Grgic 2020, Nuzzo 2024 |
| `projection-energy-deficit` | Strength projections | Active | Limited evidence | Murphy & Koehler 2022, Helms 2023 |
| `training-with-pain` | Pain | Active | Limited evidence | Smith 2017 |
| `pain-load-changes` | Pain | Planned | Limited evidence | Smith 2017 |
| `dumbbell-conversion` | Equipment | Active | Moderate evidence | Saeterbakken 2011 |

## Program and progression

### Why heavy sets first, then volume?

- **Rule id:** `tier-structure`
- **Status:** Active
- **Evidence:** Strong evidence
- **Implemented in:** `src/lib/workoutTemplates.ts` (`WORKOUT_TEMPLATES`)
- **Shown in:** `src/components/Lift/SessionList.tsx`
- **Reviewed:** November 2026

**In one line.** Heavy sets first and 2+ sessions a week build strength best

**What the app does.** Each workout starts with one heavy lift (T1: 5 sets of 3), then a moderate lift (T2: 3 sets of 10), then lighter work (T3: 3 sets of 15 or more). The four workouts rotate so squat, bench, deadlift and overhead press are each trained heavy once and for volume once per cycle.

**Why.** The largest review of the evidence found strength gains are higher with loads of 80% of 1RM or more, 2–3 sets or more, lifting early in the session and training at least twice a week. Muscle growth keeps rising with more weekly sets, with diminishing returns, which is what the T2 and T3 work adds.

**Limits.** The exact set and rep split is GZCLP's design, not a research finding.

**Sources**

- [American College of Sports Medicine (Currier et al.) (2026). American College of Sports Medicine Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. *Medicine & Science in Sports & Exercise*.](https://pubmed.ncbi.nlm.nih.gov/41843416/) Position stand; 137 systematic reviews, more than 30,000 adults. Strength gains were higher with loads of 80% of 1RM or more, 2–3 sets, lifting early in the session and at least 2 sessions a week. Training to failure did not consistently change outcomes.
- [Pelland et al. (2026). The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains. *Sports Medicine*.](https://doi.org/10.1007/s40279-025-02344-w) Meta-analysis; 67 studies, 2,058 participants. More weekly sets produced more muscle growth with diminishing returns. Strength gains levelled off much sooner and responded to training frequency. Sets that train a muscle indirectly were counted as half a set.

### Why does the weight go up, change stage or reset?

- **Rule id:** `gzclp-progression`
- **Status:** Active
- **Evidence:** Program rule
- **Implemented in:** `src/lib/progression.ts` (`evaluateT1Progression`)
- **Shown in:** `src/components/WorkoutSummary/LiftResult.tsx`
- **Reviewed:** November 2026

**In one line.** Complete every set and the weight goes up; miss and the scheme changes

**What the app does.** Complete every set and the lift goes up next time: by your plate increment for upper-body lifts and double that for lower-body lifts. Miss reps and T1 moves from 5×3 to 6×2 to 10×1, and T2 from 3×10 to 3×8 to 3×6. After the last stage the weight resets to 85% and the cycle restarts. Sessions cut short by pain, a recent run or equipment limits freeze progression: they count as neither a pass nor a fail.

**Why.** This is the GZCLP linear progression. Adding load whenever the work is completed is the standard way to progress a newer lifter, and the stage changes let you keep training heavy after a miss instead of stalling.

**Limits.** These are program rules, not research findings. The freeze rule is this app's addition.

**Sources.** None: this comes from the GZCLP program design.

### When does T3 weight go up?

- **Rule id:** `t3-progression`
- **Status:** Planned (in the code, not connected to any screen)
- **Evidence:** Program rule
- **Implemented in:** `src/lib/progression.ts` (`evaluateT3Progression`), `src/lib/workout/completeWorkout.ts` (`computeCompletion`)
- **Reviewed:** November 2026

**In one line.** T3 weight goes up when the last set reaches 25 reps

**What the app does.** When you finish every set of a T3 exercise, the app adds 5 lb for next time if the last AMRAP set reached 25 reps (or, outside a cut, if the three sets totalled 50 reps). Otherwise the weight stays the same; it never goes down. Stopping part-way, or a set cut short by pain, a recent run or equipment limits, changes nothing. The app does not yet tell you on screen when this happens.

**Why.** Muscle growth improves as sets end closer to failure. Under this rule the first two sets of 15 can be about 10 reps short of failure, and people judge reps left least accurately in high-rep sets.

**Before this is switched on.** The rule now runs when a workout is finished (computeCompletion), but no screen shows it. Show the T3 result with its citation on the workout summary, then mark the rule active. Still open: keep the stock GZCLP rule or move to a double progression (every set near the top of a rep range), which fits the evidence better.

**Sources**

- [Robinson et al. (2024). Exploring the Dose–Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta-Regressions. *Sports Medicine*.](https://doi.org/10.1007/s40279-024-02069-2) Meta-analysis; Meta-regressions of resistance training studies. Strength gains were similar whether sets stopped far from failure or close to it. Muscle growth increased as sets ended closer to failure.
- [Halperin et al. (2022). Accuracy in Predicting Repetitions to Task Failure in Resistance Exercise: A Scoping Review and Exploratory Meta-analysis. *Sports Medicine*.](https://pubmed.ncbi.nlm.nih.gov/34542869/) Meta-analysis; 12 studies, 414 participants. People underestimated the reps they had left by about one. Estimates were more accurate close to failure, in sets of 12 reps or fewer, and in later sets.

### When would accessory weights go up?

- **Rule id:** `accessory-progression`
- **Status:** Planned (in the code, not connected to any screen)
- **Evidence:** Moderate evidence
- **Implemented in:** `src/lib/accessories.ts` (`evaluateAccessoryProgression`)
- **Reviewed:** November 2026

**In one line.** Add weight once every set reaches the top of its rep range

**What the app does.** Rule in code: when every set reaches the top of its rep range, add 5 lb. After 3 sessions stuck at the same weight, drop to 90% and rebuild. Not connected.

**Why.** This double progression keeps every set reasonably close to failure, which is where muscle growth responds best.

**Before this is switched on.** Ready to connect once accessory weights are tracked per exercise in the UI.

**Sources**

- [Robinson et al. (2024). Exploring the Dose–Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta-Regressions. *Sports Medicine*.](https://doi.org/10.1007/s40279-024-02069-2) Meta-analysis; Meta-regressions of resistance training studies. Strength gains were similar whether sets stopped far from failure or close to it. Muscle growth increased as sets ended closer to failure.

## Effort and estimates

### How hard should the last set be?

- **Rule id:** `amrap-effort`
- **Status:** Active
- **Evidence:** Moderate evidence
- **Implemented in:** `src/lib/amrap.ts` (`getAMRAPGuidance`)
- **Shown in:** `src/components/ActiveWorkout/AMRAPIndicator.tsx`
- **Reviewed:** November 2026

**In one line.** Heavy sets: stop 1 rep short. Lighter sets: go close to failure

**What the app does.** On the last T1 set the app asks you to stop with about 1 rep left (RPE 9). On the last T3 set it asks you to push close to failure.

**Why.** Strength gains are similar whether heavy sets stop short of failure or reach it, and sets taken to failure take a day or two longer to recover from. Muscle growth does benefit from getting close to failure, which is why the lighter T3 sets are pushed harder.

**Limits.** People tend to have about one more rep left than they think, so an honest RPE 9 is already a hard set.

**Sources**

- [Robinson et al. (2024). Exploring the Dose–Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta-Regressions. *Sports Medicine*.](https://doi.org/10.1007/s40279-024-02069-2) Meta-analysis; Meta-regressions of resistance training studies. Strength gains were similar whether sets stopped far from failure or close to it. Muscle growth increased as sets ended closer to failure.
- [American College of Sports Medicine (Currier et al.) (2026). American College of Sports Medicine Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. *Medicine & Science in Sports & Exercise*.](https://pubmed.ncbi.nlm.nih.gov/41843416/) Position stand; 137 systematic reviews, more than 30,000 adults. Strength gains were higher with loads of 80% of 1RM or more, 2–3 sets, lifting early in the session and at least 2 sessions a week. Training to failure did not consistently change outcomes.
- [Morán-Navarro et al. (2017). Time course of recovery following resistance training leading or not to failure. *European Journal of Applied Physiology*.](https://doi.org/10.1007/s00421-017-3725-7) Trial; 10 resistance-trained men. Sets taken to failure slowed recovery by 24–48 hours compared with work stopped short of failure.

### Why log RPE?

- **Rule id:** `rpe-logging`
- **Status:** Active
- **Evidence:** Moderate evidence
- **Implemented in:** `src/components/ActiveWorkout/RPESelector.tsx` (`RPESelector`)
- **Shown in:** `src/components/ActiveWorkout/RPESelector.tsx`
- **Reviewed:** November 2026

**In one line.** RPE lets the app adjust for how hard the set really was

**What the app does.** RPE (how hard a set felt, from 6 to 10) is optional. When logged, it is used to suggest lighter T2 sets after a very hard first set, and to adjust your estimated 1RM for reps you had left.

**Why.** Effort ratings are accurate enough to be useful: on average people are off by about one rep, and they are most accurate close to failure and in sets of 12 reps or fewer.

**Limits.** Ratings on high-rep sets are less reliable, so the app only acts on RPE for T1 and T2 sets.

**Sources**

- [Halperin et al. (2022). Accuracy in Predicting Repetitions to Task Failure in Resistance Exercise: A Scoping Review and Exploratory Meta-analysis. *Sports Medicine*.](https://pubmed.ncbi.nlm.nih.gov/34542869/) Meta-analysis; 12 studies, 414 participants. People underestimated the reps they had left by about one. Estimates were more accurate close to failure, in sets of 12 reps or fewer, and in later sets.

### Why is the app suggesting a lighter weight?

- **Rule id:** `t2-autoregulation`
- **Status:** Active
- **Evidence:** Moderate evidence
- **Implemented in:** `src/lib/progression.ts` (`evaluateT2AutoRegulation`)
- **Shown in:** `src/app/workout/active/page.tsx`
- **Reviewed:** November 2026

**In one line.** A very hard first set means the planned load is too heavy today

**What the app does.** If the first T2 set is rated RPE 9 or higher while cutting (9.5 while maintaining, 10 while bulking), the app suggests dropping 5% for the remaining sets, or 10% after an RPE 10 set. Accepting freezes T2 progression for that session; it is not counted as a failure.

**Why.** Adjusting load to how the session is actually going produced larger strength gains than sticking to fixed loads in a meta-analysis of 8 studies. Effort ratings are most accurate in exactly this situation: close to failure, in sets of 12 reps or fewer.

**Limits.** The different thresholds per phase are a coaching heuristic. The studies were small and short.

**Sources**

- [Zhang et al. (2021). Auto-Regulation Method vs. Fixed-Loading Method in Maximum Strength Training for Athletes: A Systematic Review and Meta-Analysis. *Frontiers in Physiology*.](https://doi.org/10.3389/fphys.2021.651112) Meta-analysis; 8 studies, 166 athletes. Adjusting the load to how the session is going produced larger maximal-strength gains than fixed, pre-planned loads. [Free full text](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7994759/).
- [Halperin et al. (2022). Accuracy in Predicting Repetitions to Task Failure in Resistance Exercise: A Scoping Review and Exploratory Meta-analysis. *Sports Medicine*.](https://pubmed.ncbi.nlm.nih.gov/34542869/) Meta-analysis; 12 studies, 414 participants. People underestimated the reps they had left by about one. Estimates were more accurate close to failure, in sets of 12 reps or fewer, and in later sets.

### How is my 1RM estimated?

- **Rule id:** `e1rm-estimate`
- **Status:** Active
- **Evidence:** Limited evidence
- **Implemented in:** `src/lib/e1rm.ts` (`calculateE1RM`)
- **Shown in:** `src/app/1rm-calculator/page.tsx`, `src/components/Lift/PrLine.tsx`
- **Reviewed:** November 2026

**In one line.** Estimated from your heavy AMRAP set; best read as a trend

**What the app does.** Uses the Epley formula (weight × (1 + reps ÷ 30)) on T1 AMRAP sets of 10 reps or fewer. If you log an RPE, the reps you had left are added first (up to 4). The trend arrow compares your last 3 estimates.

**Why.** No formula fits everyone: the reps possible at a given percentage of 1RM differ between exercises and between people, and estimates get worse as reps climb. Within one lift the same formula still tracks change well, so the trend is more trustworthy than the number.

**Limits.** Treat the figure as an estimate, not a tested max.

**Sources**

- [Nuzzo et al. (2024). Maximal Number of Repetitions at Percentages of the One Repetition Maximum: A Meta-Regression and Moderator Analysis of Sex, Age, Training Status, and Exercise. *Sports Medicine*.](https://doi.org/10.1007/s40279-023-01937-7) Meta-analysis; 269 studies, 7,289 people. The number of reps possible at a given percentage of 1RM differs between exercises and between people, so any single formula is an approximation. [Free full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC10933212).
- [Halperin et al. (2022). Accuracy in Predicting Repetitions to Task Failure in Resistance Exercise: A Scoping Review and Exploratory Meta-analysis. *Sports Medicine*.](https://pubmed.ncbi.nlm.nih.gov/34542869/) Meta-analysis; 12 studies, 414 participants. People underestimated the reps they had left by about one. Estimates were more accurate close to failure, in sets of 12 reps or fewer, and in later sets.

## Rest between sets

### Why rest this long after heavy sets?

- **Rule id:** `rest-heavy`
- **Status:** Active
- **Evidence:** Moderate evidence
- **Implemented in:** `src/lib/restTimes.ts` (`getRestSeconds`)
- **Shown in:** `src/components/ActiveWorkout/RestTimer.tsx`
- **Reviewed:** November 2026

**In one line.** Heavy sets need 2+ minutes of rest to keep strength gains coming

**What the app does.** Rests 3:00 after T1 sets and 2:00 after T2 sets. You can add 30 seconds or skip at any time.

**Why.** A systematic review of 23 studies found trained lifters appear to need more than 2 minutes between sets to maximise strength gains. For muscle growth, resting longer than 60 seconds gives a small benefit.

**Limits.** Rest needs vary. If you feel ready sooner, going early is fine; after a very hard set, take longer.

**Sources**

- [Grgic et al. (2018). Effects of Rest Interval Duration in Resistance Training on Measures of Muscular Strength: A Systematic Review. *Sports Medicine*.](https://doi.org/10.1007/s40279-017-0788-x) Systematic review; 23 studies, 491 participants. Rest intervals longer than 2 minutes appear to be needed to maximise strength gains in trained lifters. 60–120 seconds seems enough for untrained lifters.
- [Singer et al. (2024). Give it a rest: a systematic review with Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle hypertrophy. *Frontiers in Sports and Active Living*.](https://doi.org/10.3389/fspor.2024.1429789) Meta-analysis; 9 studies. Resting longer than 60 seconds between sets gave a small muscle-growth benefit. No further benefit was detectable beyond 90 seconds. [Free full text](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/full).

### Why 90 seconds after lighter sets?

- **Rule id:** `rest-light`
- **Status:** Active
- **Evidence:** Moderate evidence
- **Implemented in:** `src/lib/restTimes.ts` (`getRestSeconds`)
- **Shown in:** `src/components/ActiveWorkout/RestTimer.tsx`
- **Reviewed:** November 2026

**In one line.** Resting over 60 seconds gives slightly better muscle growth

**What the app does.** Rests 1:30 after T3 sets and 1:30 after accessory sets.

**Why.** A meta-analysis of 9 studies found a small muscle-growth benefit from resting longer than 60 seconds between sets, with no further benefit detectable beyond 90 seconds. This gets that benefit without stretching the session.

**Sources**

- [Singer et al. (2024). Give it a rest: a systematic review with Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle hypertrophy. *Frontiers in Sports and Active Living*.](https://doi.org/10.3389/fspor.2024.1429789) Meta-analysis; 9 studies. Resting longer than 60 seconds between sets gave a small muscle-growth benefit. No further benefit was detectable beyond 90 seconds. [Free full text](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/full).

### Why 30 seconds extra while cutting?

- **Rule id:** `rest-cut-bonus`
- **Status:** Active
- **Evidence:** Coaching heuristic
- **Implemented in:** `src/lib/restTimes.ts` (`getRestSeconds`)
- **Shown in:** `src/components/ActiveWorkout/RestTimer.tsx`
- **Reviewed:** November 2026

**In one line.** Extra rest on heavy sets while cutting is a cautious convention

**What the app does.** While your phase is set to cutting, 30 seconds is added to T1 and T2 rest.

**Why.** The idea is that recovery between sets is a little slower in a calorie deficit, so heavy sets get slightly more rest to protect performance.

**Limits.** No study has tested this directly. Skip the extra time if you feel ready.

**Sources.** None: this is a coaching convention with no direct research.

## Recovery and time off

### What do the recovery statuses mean?

- **Rule id:** `recovery-windows`
- **Status:** Active
- **Evidence:** Limited evidence
- **Implemented in:** `src/lib/recovery.ts` (`calculateRecoveryStatus`), `src/lib/muscleLoad.ts` (`getMuscleRecovery`)
- **Shown in:** `src/app/workout/configure/page.tsx`, `src/components/Progress/StrengthSections.tsx`
- **Reviewed:** November 2026

**In one line.** Hard sets take 1–3 days to recover from; stress can slow that

**What the app does.** A lift shows Recovering for 48 hours after it was last trained, Ready from 48 hours, Primed from 72 to 120 hours, then Ready again. While cutting, 12 hours are added to each of these. After 21 days it shows Long break. The setup screen notes when a lift in today's workout was trained less than 48 hours ago.

**Why.** After hard sets, performance takes roughly one to three days to come back, and longer when sets were taken to failure. In one study, lifters under high life stress recovered more slowly over four days.

**Limits.** The "Primed" window and the extra 12 hours while cutting are coaching heuristics with no direct research behind them. Statuses are based on time alone; how you feel on the day counts for more.

**Sources**

- [Morán-Navarro et al. (2017). Time course of recovery following resistance training leading or not to failure. *European Journal of Applied Physiology*.](https://doi.org/10.1007/s00421-017-3725-7) Trial; 10 resistance-trained men. Sets taken to failure slowed recovery by 24–48 hours compared with work stopped short of failure.
- [Stults-Kolehmainen et al. (2014). Chronic psychological stress impairs recovery of muscular function and somatic sensations over a 96-hour period. *Journal of Strength and Conditioning Research*.](https://pubmed.ncbi.nlm.nih.gov/24343323/) Trial; 31 resistance-training students. Lifters under higher life stress recovered strength more slowly over the 96 hours after a hard session.

### Why lighter weights after a break?

- **Rule id:** `time-off`
- **Status:** Active
- **Evidence:** Limited evidence
- **Implemented in:** `src/lib/weightDecay.ts` (`calculateWeightDecay`), `src/lib/recovery.ts` (`LONG_BREAK_DAYS`), `src/lib/inactivity.ts` (`checkInactivity`)
- **Shown in:** `src/app/workout/configure/page.tsx`
- **Reviewed:** November 2026

**In one line.** Short breaks cost little strength; long ones come back fast

**What the app does.** Breaks of up to 20 days change nothing. After that the setup screen suggests starting lighter: 5% after 21–41 days, 10% after 42–69 days, 15% after 70 days or more. The suggestion is scaled by 1.25 while cutting and 0.75 while bulking, and never exceeds 20%. You can always keep your old weight.

**Why.** Strength is well preserved through breaks: one session a week maintains it for months, and after a full 10-week layoff trainees were back to their pre-break level in about 5 weeks. Losses do grow with the length of the break, so the suggestion scales with time away.

**Limits.** The research shows the direction and rough size of the effect; the exact percentages are this app's judgment, and the phase scaling is a heuristic. The 10-week study used people new to lifting.

**Sources**

- [Spiering et al. (2021). Maintaining Physical Performance: The Minimal Dose of Exercise Needed to Preserve Endurance and Strength Over Time. *Journal of Strength and Conditioning Research*.](https://pubmed.ncbi.nlm.nih.gov/33629972/) Review; Narrative review. Strength can be maintained for up to 32 weeks with as little as one session a week and one set per exercise, as long as the load stays heavy.
- [Halonen et al. (2024). Does Taking a Break Matter—Adaptations in Muscle Strength and Size Between Continuous and Periodic Resistance Training. *Scandinavian Journal of Medicine & Science in Sports*.](https://pubmed.ncbi.nlm.nih.gov/39364857/) Randomised trial; 55 untrained adults. After a 10-week break, strength and muscle size were back to pre-break levels within about 5 weeks of retraining. Strength was better preserved than size.
- [Bosquet et al. (2013). Effect of training cessation on muscular performance: A meta-analysis. *Scandinavian Journal of Medicine & Science in Sports*.](https://doi.org/10.1111/sms.12047) Meta-analysis; 103 studies. Strength declines when training stops, and the loss grows with the length of the break.

### Why does the app ask about sleep and stress?

- **Rule id:** `readiness`
- **Status:** Active
- **Evidence:** Moderate evidence
- **Implemented in:** `src/components/PreWorkout/ReadinessCheck.tsx` (`ReadinessCheck`)
- **Shown in:** `src/components/PreWorkout/ReadinessCheck.tsx`
- **Reviewed:** November 2026

**In one line.** Poor sleep and high stress both reduce performance and recovery

**What the app does.** Before a workout you can log last night's sleep and your stress or energy. If you report under 5 hours of sleep and low energy together, the app suggests skipping accessories. Nothing else changes.

**Why.** A night of lost or restricted sleep lowers physical performance by about 7.6% on average, and lifters under high life stress recover strength more slowly after a hard session.

**Limits.** The suggestion is deliberately mild. The app does not yet use these answers to change loads or recovery estimates.

**Sources**

- [Craven et al. (2022). Effects of Acute Sleep Loss on Physical Performance: A Systematic and Meta-Analytical Review. *Sports Medicine*.](https://doi.org/10.1007/s40279-022-01706-y) Meta-analysis; 69 publications. A night of lost or restricted sleep lowered physical performance by about 7.6% on average.
- [Stults-Kolehmainen et al. (2014). Chronic psychological stress impairs recovery of muscular function and somatic sensations over a 96-hour period. *Journal of Strength and Conditioning Research*.](https://pubmed.ncbi.nlm.nih.gov/24343323/) Trial; 31 resistance-training students. Lifters under higher life stress recovered strength more slowly over the 96 hours after a hard session.

### What would a deload look like?

- **Rule id:** `deload`
- **Status:** Planned (in the code, not connected to any screen)
- **Evidence:** Limited evidence
- **Implemented in:** `src/lib/deload.ts` (`generateDeloadPrescription`)
- **Reviewed:** November 2026

**In one line.** Deloads have not been shown to improve gains; keep them short

**What the app does.** Rule in code: reduce T1 and T2 weights by 10% (15% while cutting) for four sessions, reduce T3 volume and limit accessories, then restore the previous weights. It is not connected, so the app never starts a deload.

**Why.** Trials so far show deloads cost little but do not improve results: a week off mid-program led to smaller strength gains, and reduced-volume weeks were neutral. When training is reduced, keeping the load heavy is what preserves strength.

**Before this is switched on.** Change the prescription to cut sets (by a third to a half) and keep the load, shorten it, and make it optional.

**Sources**

- [Coleman et al. (2024). Gaining more from doing less? The effects of a one-week deload period during supervised resistance training on muscular adaptations. *PeerJ*.](https://peerj.com/articles/16777) Randomised trial; 39 trained adults, 9 weeks. A week off training at the midpoint did not improve muscle growth and led to smaller strength gains than training straight through.
- [Pancar et al. (2026). Effects of deload periods in resistance training on muscle hypertrophy and strength endurance in untrained young men using a randomized within subject design. *Scientific Reports*.](https://www.nature.com/articles/s41598-026-40612-5) Trial; 19 untrained young men, 8 weeks. Limbs given reduced-volume deload weeks gained as much muscle and strength-endurance as limbs trained continuously.
- [Spiering et al. (2021). Maintaining Physical Performance: The Minimal Dose of Exercise Needed to Preserve Endurance and Strength Over Time. *Journal of Strength and Conditioning Research*.](https://pubmed.ncbi.nlm.nih.gov/33629972/) Review; Narrative review. Strength can be maintained for up to 32 weeks with as little as one session a week and one set per exercise, as long as the load stays heavy.

### Why does a hard yoga class or ride matter?

- **Rule id:** `activity-fatigue`
- **Status:** Active
- **Evidence:** Coaching heuristic
- **Implemented in:** `src/lib/activities.ts` (`evaluateActivityImpact`)
- **Shown in:** `src/app/workout/configure/page.tsx`
- **Reviewed:** November 2026

**In one line.** A hard session in the last day can leave you a little short

**What the app does.** Before a workout, the app checks the yoga, cycling, hiking, walking and other sessions you logged in the last 24 hours. If one was rated effort 4 or more out of 5, it shows a note suggesting you judge the day by your warm-ups. Cycling, hiking and walking are only mentioned before a lower-body T1 lift. The note never changes your weights, and these sessions never affect progression.

**Why.** A hard session of any kind leaves some fatigue, and it is better to have it in mind than to be surprised by a slow warm-up. Easy and moderate sessions are not flagged.

**Limits.** How much a yoga class, ride or hike takes out of the next day's lifting has not been studied directly. The effort threshold and the time window are coaching conventions. The style of a yoga class is recorded but not used: your effort rating decides.

**Sources.** None: this is a coaching convention with no direct research.

### How would the app detect built-up fatigue?

- **Rule id:** `fatigue-detection`
- **Status:** Planned (in the code, not connected to any screen)
- **Evidence:** Coaching heuristic
- **Implemented in:** `src/lib/deload.ts` (`checkSystemicFatigue`)
- **Reviewed:** November 2026

**In one line.** Fatigue checks from estimated 1RM, RPE and AMRAP trends

**What the app does.** Rule in code: flag a lift when estimated 1RM falls, RPE rises or AMRAP reps fall for 2–4 sessions in a row (fewer while cutting). Two or more flags recommend a deload. Not connected.

**Why.** Tracking performance trends is a reasonable way to spot fatigue, but no study validates these specific triggers.

**Before this is switched on.** Rising RPE and falling AMRAP reps are expected when the weight goes up every session. Compare at equal load, or use the estimated 1RM trend only, before connecting.

**Sources.** None: this is a coaching convention with no direct research.

## Running

### Why does a recent run matter?

- **Rule id:** `run-interference`
- **Status:** Active
- **Evidence:** Moderate evidence
- **Implemented in:** `src/lib/runRecovery.ts` (`evaluateRunImpact`)
- **Shown in:** `src/app/workout/configure/page.tsx`
- **Reviewed:** November 2026

**In one line.** A hard run in the last few hours lowers leg strength

**What the app does.** Before a workout with a lower-body T1 lift, the app checks your most recent run. A hard run (effort 4 or more out of 5, or a non-easy run of 45 minutes or more) in the last 6 hours suggests reducing T1 by 10% or lifting later. A run in the last 24 hours at effort 3 or more (2 for intervals or tempo, 4 for easy runs) shows a lighter note. Neither changes your workout unless you choose to.

**Why.** Aerobic exercise reduces strength for a while afterwards, more after longer or harder sessions, and less after running than cycling. In a training study, strength gains suffered when sessions were back to back but not when they were 6 hours apart. Over the long run, combining running and lifting does not compromise strength or muscle growth.

**Limits.** The effort thresholds per run type are coaching heuristics. Only the T1 lift is checked.

**Sources**

- [Robineau et al. (2016). Specific Training Effects of Concurrent Aerobic and Strength Exercises Depend on Recovery Duration. *Journal of Strength and Conditioning Research*.](https://pubmed.ncbi.nlm.nih.gov/25546450/) Trial; 58 amateur rugby players, 7 weeks. Strength gains were smaller when strength and aerobic sessions were done back to back, but not when they were 6 or 24 hours apart.
- [Markov et al. (2021). Acute Effects of Aerobic Exercise on Muscle Strength and Power in Trained Male Individuals: A Systematic Review with Meta-analysis. *Sports Medicine*.](https://doi.org/10.1007/s40279-021-01615-6) Meta-analysis; 15 studies in trained men. Aerobic exercise reduced strength immediately afterwards, more after sessions longer than 30 minutes or at higher intensity, and less after running than cycling. [Free full text](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9124655/).
- [Schumann et al. (2022). Compatibility of Concurrent Aerobic and Strength Training for Skeletal Muscle Size and Function: An Updated Systematic Review and Meta-Analysis. *Sports Medicine*.](https://doi.org/10.1007/s40279-021-01587-7) Meta-analysis; Systematic review and meta-analysis. Combining aerobic and strength training did not compromise muscle growth or maximal strength.

## Training volume

### How is weekly volume counted, and why 10 sets?

- **Rule id:** `weekly-volume`
- **Status:** Active
- **Evidence:** Moderate evidence
- **Implemented in:** `src/lib/volumeTracking.ts` (`calculateMuscleGroupVolume`), `src/lib/muscleLoad.ts` (`weeklyHeatLevel`)
- **Shown in:** `src/components/Progress/MusclesTab.tsx`
- **Reviewed:** November 2026

**In one line.** More weekly sets build more muscle, with diminishing returns

**What the app does.** Each completed set counts 1 for the muscles an exercise mainly trains and 0.5 for muscles it trains indirectly. Warm-ups and sets skipped for pain are excluded. The chart marks 10 weekly sets per muscle group as the target.

**Why.** The largest analysis of training volume counted sets exactly this way and found muscle growth rises with weekly sets, with diminishing returns. Programs with 10 or more weekly sets per muscle group also showed little or no muscle loss while dieting.

**Limits.** There is no magic number: 10 is a practical target, not a threshold. Strength gains level off at much lower volumes.

**Sources**

- [Pelland et al. (2026). The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains. *Sports Medicine*.](https://doi.org/10.1007/s40279-025-02344-w) Meta-analysis; 67 studies, 2,058 participants. More weekly sets produced more muscle growth with diminishing returns. Strength gains levelled off much sooner and responded to training frequency. Sets that train a muscle indirectly were counted as half a set.
- [Roth et al. (2022). Lean mass sparing in resistance-trained athletes during caloric restriction: the role of resistance training volume. *European Journal of Applied Physiology*.](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9012799/) Systematic review; 15 studies in resistance-trained athletes. Programs with 10 or more weekly sets per muscle group showed little or no lean-mass loss during a calorie deficit, though the evidence is not conclusive.

### Why not fewer accessories while cutting?

- **Rule id:** `accessories-in-cut`
- **Status:** Active
- **Evidence:** Limited evidence
- **Implemented in:** `src/lib/accessories.ts` (`getPhaseAccessoryCap`)
- **Shown in:** `src/components/PreWorkout/AccessoryPicker.tsx`
- **Reviewed:** November 2026

**In one line.** Keeping volume up while dieting may help hold on to muscle

**What the app does.** The picker lets you add up to 3 accessories per session while cutting, the same as while maintaining (3), and 4 while bulking.

**Why.** It is tempting to do less while eating less, but the research does not support that. A review of dieting lifters found programs with 10 or more weekly sets per muscle group lost little or no muscle, and a calorie deficit mainly limits muscle gain rather than strength.

**Limits.** The evidence is suggestive, not conclusive: one trial found no difference between moderate and high volume. The caps themselves are a practical choice to keep sessions manageable.

**Sources**

- [Roth et al. (2022). Lean mass sparing in resistance-trained athletes during caloric restriction: the role of resistance training volume. *European Journal of Applied Physiology*.](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9012799/) Systematic review; 15 studies in resistance-trained athletes. Programs with 10 or more weekly sets per muscle group showed little or no lean-mass loss during a calorie deficit, though the evidence is not conclusive.
- [Murphy & Koehler (2022). Energy deficiency impairs resistance training gains in lean mass but not strength: A meta-analysis and meta-regression. *Scandinavian Journal of Medicine & Science in Sports*.](https://doi.org/10.1111/sms.14075) Meta-analysis; Mostly untrained participants. Training in a calorie deficit impaired lean-mass gains but not strength gains.

### How much accessory work is too much?

- **Rule id:** `volume-ratio`
- **Status:** Planned (in the code, not connected to any screen)
- **Evidence:** Coaching heuristic
- **Implemented in:** `src/lib/volumeRatio.ts` (`calculateSessionVolumeRatio`)
- **Reviewed:** November 2026

**In one line.** A guard against sessions growing too long

**What the app does.** Rule in code: warn when T3 and accessory reps exceed 5 times (cutting), 7 times (maintaining) or 10 times (bulking) the T1 reps in a session. Not connected.

**Why.** A practical limit on session length. No research supports these particular ratios.

**Before this is switched on.** The cutting message says extra volume will impair recovery, which the research on dieting lifters does not support. Reword or drop it before connecting.

**Sources.** None: this is a coaching convention with no direct research.

## Fat loss

### How fast should I lose weight?

- **Rule id:** `rate-of-loss`
- **Status:** Active
- **Evidence:** Moderate evidence
- **Implemented in:** `src/lib/rateOfLoss.ts` (`calculateWeeklyRateOfLoss`)
- **Shown in:** `src/components/Progress/BodyTab.tsx`, `src/components/Progress/body/BodyDetail.tsx`
- **Reviewed:** November 2026

**In one line.** Losing 0.5–1% of bodyweight a week protects muscle

**What the app does.** While cutting, a weekly loss of 0.5–1.0% of bodyweight is on pace, 0.25–0.5% or 1.0–1.5% yellow, above 1.5% red, and a change of less than 0.25% either way a stall. A gain of 0.25% or more is reported as weight going up, not as a stall. Several weigh-ins on one day count as one day (their average). The Body tab labels your rate of change on pace, slow or fast, and the bodyweight page shades the target band on the weekly rate chart.

**Why.** A review for physique athletes recommends losing 0.5–1% of bodyweight per week to retain muscle while dieting.

**Sources**

- [Helms et al. (2014). Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation. *Journal of the International Society of Sports Nutrition*.](https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492) Review; Review for physique athletes. Losing 0.5–1% of bodyweight per week is recommended to retain muscle while dieting.

### What should I do when weight loss stalls?

- **Rule id:** `fat-loss-stall`
- **Status:** Planned (in the code, not connected to any screen)
- **Evidence:** Limited evidence
- **Implemented in:** `src/lib/stallDetection.ts` (`detectFatLossStall`)
- **Reviewed:** November 2026

**In one line.** Wait about three weeks before treating a slow patch as a stall

**What the app does.** Rule in code: flag a stall when this week's 7-day average is less than 0.3 lb below last week's, and suggest re-checking intake, adding cardio or taking a diet break. Several weigh-ins on one day count as one day (their average). The chart that would show it is not on any screen.

**Why.** Week-to-week weight is noisy. In a 12-week trial with resistance-trained adults, week-long diet breaks did not improve fat loss or muscle retention, so a diet break is a comfort choice rather than a fix.

**Before this is switched on.** Require about three slow weeks before flagging (the rule in rateOfLoss.ts already does) and present the diet break as optional.

**Sources**

- [Peos et al. (2021). Continuous versus Intermittent Dieting for Fat Loss and Fat-Free Mass Retention in Resistance-trained Adults: The ICECAP Trial. *Medicine & Science in Sports & Exercise*.](https://pubmed.ncbi.nlm.nih.gov/33587549/) Randomised trial; 61 resistance-trained adults, 12 weeks. Week-long diet breaks did not improve fat loss or lean-mass retention compared with continuous dieting.

## Strength projections

### How much would more sets or sessions speed up my lift?

- **Rule id:** `projection-dose-response`
- **Status:** Active
- **Evidence:** Limited evidence
- **Implemented in:** `src/lib/projection/coefficients.ts` (`PROJECTION_COEFFICIENTS`)
- **Shown in:** `src/components/Projection/HowItWorks.tsx`
- **Reviewed:** November 2026

**In one line.** More sessions help strength a little; extra sets help even less

**What the app does.** The projection scales your own measured rate of gain. At equal weekly sets, the rate is multiplied by (new sessions ÷ current sessions) ^ 0.2, so doubling sessions adds about 15%. Weekly sets for the lift's main muscles scale it by (new ÷ current) ^ 0.1, so doubling sets adds about 7%, and sets beyond 20 a week add nothing. The combined effect is held between ×0.5 and ×1.3. The further an alternative is from what you do now, the wider its range: by 0.5 × the size of the change in rate (on a log scale).

**Why.** The largest analysis of training dose found strength rises with weekly sets but levels off quickly, with no clear extra gain beyond about 4–5 sets a week, while training a lift more often kept adding strength with diminishing returns even when total sets were accounted for.

**Limits.** The research gives the shape, not these numbers: the exponents are our conversion of meta-regression slopes, and the frequency one is halved because an earlier meta-analysis found no effect of frequency when weekly volume was equal. Most studies were short and used novel test lifts, where practice alone makes people stronger. How much wider an alternative's range gets is a judgment, not a measured value.

**Sources**

- [Pelland et al. (2026). The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains. *Sports Medicine*.](https://doi.org/10.1007/s40279-025-02344-w) Meta-analysis; 67 studies, 2,058 participants. More weekly sets produced more muscle growth with diminishing returns. Strength gains levelled off much sooner and responded to training frequency. Sets that train a muscle indirectly were counted as half a set.
- [Grgic et al. (2018). Effect of Resistance Training Frequency on Gains in Muscular Strength: A Systematic Review and Meta-Analysis. *Sports Medicine*.](https://doi.org/10.1007/s40279-018-0872-x) Meta-analysis; 22 studies. Strength gains grew with weekly training frequency, but in studies that kept weekly volume equal the effect of frequency was not significant.
- [American College of Sports Medicine (Currier et al.) (2026). American College of Sports Medicine Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. *Medicine & Science in Sports & Exercise*.](https://pubmed.ncbi.nlm.nih.gov/41843416/) Position stand; 137 systematic reviews, more than 30,000 adults. Strength gains were higher with loads of 80% of 1RM or more, 2–3 sets, lifting early in the session and at least 2 sessions a week. Training to failure did not consistently change outcomes.

### Do other exercises for the same muscles count toward this lift?

- **Rule id:** `projection-specificity`
- **Status:** Active
- **Evidence:** Limited evidence
- **Implemented in:** `src/lib/projection/coefficients.ts` (`PROJECTION_COEFFICIENTS`)
- **Shown in:** `src/components/Projection/HowItWorks.tsx`
- **Reviewed:** November 2026

**In one line.** Other exercises for the same muscles count, but less than the lift

**What the app does.** When projecting a lift, each weekly set of a different exercise for its main muscles counts as 0.4 of a set of the lift itself before the volume curve is applied.

**Why.** Strength is specific: gains are largest in the exercise you practise. Counting other exercises for the same muscles as half a set predicted strength gains far better than ignoring them or counting them fully, and strength in an untrained test of the same muscles improved by less than half as much as in the trained lift.

**Limits.** Only whole, half and zero credit have been compared, and the transfer study measured isometric tests rather than another barbell lift, so the exact figure is a judgment rounded down to stay cautious.

**Sources**

- [Pelland et al. (2026). The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains. *Sports Medicine*.](https://doi.org/10.1007/s40279-025-02344-w) Meta-analysis; 67 studies, 2,058 participants. More weekly sets produced more muscle growth with diminishing returns. Strength gains levelled off much sooner and responded to training frequency. Sets that train a muscle indirectly were counted as half a set.
- [Saeterbakken et al. (2025). Task Specificity of Dynamic Resistance Training and Its Transferability to Non-trained Isometric Muscle Strength: A Systematic Review with Meta-analysis. *Sports Medicine*.](https://doi.org/10.1007/s40279-025-02225-2) Meta-analysis; 43 studies, 1,660 people. Strength in the trained lifting task improved about twice as much (effect size 0.98) as strength in an untrained test of the same muscles (0.42). [Free full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC12296774).
- [Mattocks et al. (2017). Practicing the Test Produces Strength Equivalent to Higher Volume Training. *Medicine & Science in Sports & Exercise*.](https://doi.org/10.1249/MSS.0000000000001300) Randomised trial; 38 untrained adults, 8 weeks. Just practising 1RM attempts raised 1RM as much as four sets to failure did, even though the high-volume group grew more muscle.

### Why does the projection curve flatten, and why is the range so wide?

- **Rule id:** `projection-rate-of-gain`
- **Status:** Active
- **Evidence:** Limited evidence
- **Implemented in:** `src/lib/projection/coefficients.ts` (`PROJECTION_COEFFICIENTS`)
- **Shown in:** `src/components/Projection/HowItWorks.tsx`
- **Reviewed:** November 2026

**In one line.** Strength gains slow over time, and single estimates are noisy

**What the app does.** The projected weekly gain keeps 96% of the previous week's, so it halves in about 17 weeks. The range is 1.28 times the scatter of your own estimates around their trend (about an 80% range), widened by (1 + 0.5 × √weeks ahead). The scatter is never taken as less than 2.1% of your current estimate, so a very steady history still gets a range.

**Why.** In nearly 15,000 adults' training records, strength rose quickly at first and then ever more slowly, practically levelling off after one to two years, and stronger powerlifters improved more slowly than weaker ones. Even a tested 1RM varies by a few percent from day to day, and estimates from rep sets vary more, so a single projected number would look more certain than it is.

**Limits.** How fast gains slow depends on how long you have trained; the app uses one rate that fits someone about four months in, so it under-promises for longer-trained lifters and may over-promise for someone in their first few months. The studies were of machine training and competition totals, not of a GZCLP lifter's estimated 1RM. The growth of the range is a judgment, not a measured value.

**Sources**

- [Steele et al. (2023). Long-Term Time-Course of Strength Adaptation to Minimal Dose Resistance Training Through Retrospective Longitudinal Growth Modeling. *Research Quarterly for Exercise and Sport*.](https://doi.org/10.1080/02701367.2022.2070592) Observational study; 14,690 adults' training records, up to 6.8 years. Strength rose quickly at first and then ever more slowly, following a log-shaped curve that had practically levelled off after 1–2 years.
- [Latella et al. (2020). Long-Term Strength Adaptation: A 15-Year Analysis of Powerlifting Athletes. *Journal of Strength and Conditioning Research*.](https://doi.org/10.1519/JSC.0000000000003657) Observational study; 1,897 powerlifters' competition records, 15 years. The strongest men gained strength about half as fast as the least strong (0.10 vs 0.21 kg a day). [Free full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC7448836).
- [Grgic et al. (2020). Test-Retest Reliability of the One-Repetition Maximum (1RM) Strength Assessment: a Systematic Review. *Sports Medicine - Open*.](https://doi.org/10.1186/s40798-020-00260-z) Systematic review; 32 studies, 1,595 people. A tested 1RM is highly repeatable, but still varies between sessions by a median of 4.2% (range 0.5–12.1%). [Free full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC7367986).
- [Nuzzo et al. (2024). Maximal Number of Repetitions at Percentages of the One Repetition Maximum: A Meta-Regression and Moderator Analysis of Sex, Age, Training Status, and Exercise. *Sports Medicine*.](https://doi.org/10.1007/s40279-023-01937-7) Meta-analysis; 269 studies, 7,289 people. The number of reps possible at a given percentage of 1RM differs between exercises and between people, so any single formula is an approximation. [Free full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC10933212).

### How much does cutting slow strength gains?

- **Rule id:** `projection-energy-deficit`
- **Status:** Active
- **Evidence:** Limited evidence
- **Implemented in:** `src/lib/projection/coefficients.ts` (`PROJECTION_COEFFICIENTS`)
- **Shown in:** `src/components/Projection/HowItWorks.tsx`
- **Reviewed:** November 2026

**In one line.** A calorie deficit slows strength gains only a little, if at all

**What the app does.** The projected rate is multiplied by 0.8 while cutting and 0.95 while maintaining, relative to 1 while bulking.

**Why.** A meta-analysis found training in a calorie deficit limited lean-mass gains but did not significantly reduce strength gains. In trained lifters, eating 5% or 15% above maintenance did not improve squat 1RM over eating at maintenance.

**Limits.** The research supports a small or no penalty but gives no number; the deficit studies were mostly in untrained people, and the surplus trial had 17 finishers. The app keeps a modest cutting penalty, based on the negative but uncertain average effect, so it does not over-promise.

**Sources**

- [Murphy & Koehler (2022). Energy deficiency impairs resistance training gains in lean mass but not strength: A meta-analysis and meta-regression. *Scandinavian Journal of Medicine & Science in Sports*.](https://doi.org/10.1111/sms.14075) Meta-analysis; Mostly untrained participants. Training in a calorie deficit impaired lean-mass gains but not strength gains.
- [Helms et al. (2023). Effect of Small and Large Energy Surpluses on Strength, Muscle, and Skinfold Thickness in Resistance-Trained Individuals: A Parallel Groups Design. *Sports Medicine - Open*.](https://doi.org/10.1186/s40798-023-00651-y) Randomised trial; 17 trained lifters who finished, 8 weeks. Eating 5% or 15% above maintenance did not improve squat 1RM or muscle thickness over maintenance, and faster bodyweight gain mainly added fat. [Free full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC10620361).

## Pain

### Should I train with pain?

- **Rule id:** `training-with-pain`
- **Status:** Active
- **Evidence:** Limited evidence
- **Implemented in:** `src/lib/painModifications.ts` (`shouldShowRedFlag`)
- **Shown in:** `src/components/Dashboard/ActivePainBanner.tsx`
- **Reviewed:** November 2026

**In one line.** Mild pain is usually something to work around, not a reason to stop

**What the app does.** Logged pain (not soreness) is shown on the dashboard and against the exercises it could affect. Severity 4 or 5 opens a safety screen. Pain entries ask to be re-checked after 7 days. The app never changes your weights for pain on its own.

**Why.** In people with ongoing musculoskeletal pain, exercise that allowed some discomfort did slightly better in the short term than strictly pain-free exercise, with no difference later. Adjusting training is generally a better response than stopping altogether.

**Limits.** That research is about long-standing pain in supervised programs, not new injuries from lifting. Sharp, worsening or severe pain, numbness or weakness means stop and see a clinician. This is not medical advice.

**Sources**

- [Smith et al. (2017). Should exercises be painful in the management of chronic musculoskeletal pain? A systematic review and meta-analysis. *British Journal of Sports Medicine*.](https://doi.org/10.1136/bjsports-2016-097383) Meta-analysis; 7 trials, 385 people with chronic musculoskeletal pain. Exercise programs that allowed some pain gave a small short-term benefit over pain-free exercise, with no difference in the medium or long term. [Free full text](https://eprints.nottingham.ac.uk/41764).

### How would pain change my weights?

- **Rule id:** `pain-load-changes`
- **Status:** Planned (in the code, not connected to any screen)
- **Evidence:** Limited evidence
- **Implemented in:** `src/lib/painModifications.ts` (`generateModifications`)
- **Reviewed:** November 2026

**In one line.** Pain would lower the load rather than cancel the session

**What the app does.** Rule in code: for exercises that load the painful area, severity 2 suggests 10% less weight, severity 3 suggests 20% less, severity 4 skips the T1 lift and halves the rest, and severity 5 skips them all. Soreness changes nothing. Not connected.

**Why.** Reducing load keeps you training while respecting symptoms. The specific percentages are a coaching convention.

**Limits.** The supporting research is about long-standing pain in supervised programs. This is not medical advice.

**Before this is switched on.** Ready to connect. Every suggestion must stay optional.

**Sources**

- [Smith et al. (2017). Should exercises be painful in the management of chronic musculoskeletal pain? A systematic review and meta-analysis. *British Journal of Sports Medicine*.](https://doi.org/10.1136/bjsports-2016-097383) Meta-analysis; 7 trials, 385 people with chronic musculoskeletal pain. Exercise programs that allowed some pain gave a small short-term benefit over pain-free exercise, with no difference in the medium or long term. [Free full text](https://eprints.nottingham.ac.uk/41764).

## Equipment

### How are barbell weights converted to dumbbells?

- **Rule id:** `dumbbell-conversion`
- **Status:** Active
- **Evidence:** Moderate evidence
- **Implemented in:** `src/lib/dbConversion.ts` (`barbellToDumbbell`), `src/lib/autoAdapt.ts` (`adaptExerciseForHome`)
- **Shown in:** `src/app/workout/configure/page.tsx`
- **Reviewed:** November 2026

**In one line.** Dumbbell presses run about 17–20% lighter than the barbell

**What the app does.** For home workouts, the total dumbbell load is set to 80% of the barbell weight, split between two hands and rounded to 5 lb. If that is more than your heaviest dumbbells, the app picks the next exercise that fits, or caps the weight. Presses and rows are marked high confidence; squat and deadlift substitutes medium.

**Why.** Measured directly, dumbbell bench press 1RM was about 17% below barbell bench press 1RM, because dumbbells are harder to stabilise.

**Limits.** That study covers the bench press only. No research gives a conversion for squats or deadlifts, which is why those substitutes are marked medium confidence.

**Sources**

- [Saeterbakken et al. (2011). A comparison of muscle activity and 1-RM strength of three chest-press exercises with different stability requirements. *Journal of Sports Sciences*.](https://pubmed.ncbi.nlm.nih.gov/21225489/) Trial; Trained lifters, three bench-press variations. Dumbbell bench press 1RM was about 17% lower than barbell bench press 1RM.

## Bibliography

- [American College of Sports Medicine (Currier et al.) (2026). American College of Sports Medicine Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. *Medicine & Science in Sports & Exercise*.](https://pubmed.ncbi.nlm.nih.gov/41843416/) Position stand; 137 systematic reviews, more than 30,000 adults. Strength gains were higher with loads of 80% of 1RM or more, 2–3 sets, lifting early in the session and at least 2 sessions a week. Training to failure did not consistently change outcomes. Used by: `tier-structure`, `amrap-effort`, `projection-dose-response`.
- [Bosquet et al. (2013). Effect of training cessation on muscular performance: A meta-analysis. *Scandinavian Journal of Medicine & Science in Sports*.](https://doi.org/10.1111/sms.12047) Meta-analysis; 103 studies. Strength declines when training stops, and the loss grows with the length of the break. Used by: `time-off`.
- [Coleman et al. (2024). Gaining more from doing less? The effects of a one-week deload period during supervised resistance training on muscular adaptations. *PeerJ*.](https://peerj.com/articles/16777) Randomised trial; 39 trained adults, 9 weeks. A week off training at the midpoint did not improve muscle growth and led to smaller strength gains than training straight through. Used by: `deload`.
- [Craven et al. (2022). Effects of Acute Sleep Loss on Physical Performance: A Systematic and Meta-Analytical Review. *Sports Medicine*.](https://doi.org/10.1007/s40279-022-01706-y) Meta-analysis; 69 publications. A night of lost or restricted sleep lowered physical performance by about 7.6% on average. Used by: `readiness`.
- [Grgic et al. (2018). Effects of Rest Interval Duration in Resistance Training on Measures of Muscular Strength: A Systematic Review. *Sports Medicine*.](https://doi.org/10.1007/s40279-017-0788-x) Systematic review; 23 studies, 491 participants. Rest intervals longer than 2 minutes appear to be needed to maximise strength gains in trained lifters. 60–120 seconds seems enough for untrained lifters. Used by: `rest-heavy`.
- [Grgic et al. (2018). Effect of Resistance Training Frequency on Gains in Muscular Strength: A Systematic Review and Meta-Analysis. *Sports Medicine*.](https://doi.org/10.1007/s40279-018-0872-x) Meta-analysis; 22 studies. Strength gains grew with weekly training frequency, but in studies that kept weekly volume equal the effect of frequency was not significant. Used by: `projection-dose-response`.
- [Grgic et al. (2020). Test-Retest Reliability of the One-Repetition Maximum (1RM) Strength Assessment: a Systematic Review. *Sports Medicine - Open*.](https://doi.org/10.1186/s40798-020-00260-z) Systematic review; 32 studies, 1,595 people. A tested 1RM is highly repeatable, but still varies between sessions by a median of 4.2% (range 0.5–12.1%). [Free full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC7367986). Used by: `projection-rate-of-gain`.
- [Halonen et al. (2024). Does Taking a Break Matter—Adaptations in Muscle Strength and Size Between Continuous and Periodic Resistance Training. *Scandinavian Journal of Medicine & Science in Sports*.](https://pubmed.ncbi.nlm.nih.gov/39364857/) Randomised trial; 55 untrained adults. After a 10-week break, strength and muscle size were back to pre-break levels within about 5 weeks of retraining. Strength was better preserved than size. Used by: `time-off`.
- [Halperin et al. (2022). Accuracy in Predicting Repetitions to Task Failure in Resistance Exercise: A Scoping Review and Exploratory Meta-analysis. *Sports Medicine*.](https://pubmed.ncbi.nlm.nih.gov/34542869/) Meta-analysis; 12 studies, 414 participants. People underestimated the reps they had left by about one. Estimates were more accurate close to failure, in sets of 12 reps or fewer, and in later sets. Used by: `t3-progression`, `rpe-logging`, `t2-autoregulation`, `e1rm-estimate`.
- [Helms et al. (2014). Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation. *Journal of the International Society of Sports Nutrition*.](https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492) Review; Review for physique athletes. Losing 0.5–1% of bodyweight per week is recommended to retain muscle while dieting. Used by: `rate-of-loss`.
- [Helms et al. (2023). Effect of Small and Large Energy Surpluses on Strength, Muscle, and Skinfold Thickness in Resistance-Trained Individuals: A Parallel Groups Design. *Sports Medicine - Open*.](https://doi.org/10.1186/s40798-023-00651-y) Randomised trial; 17 trained lifters who finished, 8 weeks. Eating 5% or 15% above maintenance did not improve squat 1RM or muscle thickness over maintenance, and faster bodyweight gain mainly added fat. [Free full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC10620361). Used by: `projection-energy-deficit`.
- [Latella et al. (2020). Long-Term Strength Adaptation: A 15-Year Analysis of Powerlifting Athletes. *Journal of Strength and Conditioning Research*.](https://doi.org/10.1519/JSC.0000000000003657) Observational study; 1,897 powerlifters' competition records, 15 years. The strongest men gained strength about half as fast as the least strong (0.10 vs 0.21 kg a day). [Free full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC7448836). Used by: `projection-rate-of-gain`.
- [Markov et al. (2021). Acute Effects of Aerobic Exercise on Muscle Strength and Power in Trained Male Individuals: A Systematic Review with Meta-analysis. *Sports Medicine*.](https://doi.org/10.1007/s40279-021-01615-6) Meta-analysis; 15 studies in trained men. Aerobic exercise reduced strength immediately afterwards, more after sessions longer than 30 minutes or at higher intensity, and less after running than cycling. [Free full text](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9124655/). Used by: `run-interference`.
- [Mattocks et al. (2017). Practicing the Test Produces Strength Equivalent to Higher Volume Training. *Medicine & Science in Sports & Exercise*.](https://doi.org/10.1249/MSS.0000000000001300) Randomised trial; 38 untrained adults, 8 weeks. Just practising 1RM attempts raised 1RM as much as four sets to failure did, even though the high-volume group grew more muscle. Used by: `projection-specificity`.
- [Morán-Navarro et al. (2017). Time course of recovery following resistance training leading or not to failure. *European Journal of Applied Physiology*.](https://doi.org/10.1007/s00421-017-3725-7) Trial; 10 resistance-trained men. Sets taken to failure slowed recovery by 24–48 hours compared with work stopped short of failure. Used by: `amrap-effort`, `recovery-windows`.
- [Murphy & Koehler (2022). Energy deficiency impairs resistance training gains in lean mass but not strength: A meta-analysis and meta-regression. *Scandinavian Journal of Medicine & Science in Sports*.](https://doi.org/10.1111/sms.14075) Meta-analysis; Mostly untrained participants. Training in a calorie deficit impaired lean-mass gains but not strength gains. Used by: `accessories-in-cut`, `projection-energy-deficit`.
- [Nuzzo et al. (2024). Maximal Number of Repetitions at Percentages of the One Repetition Maximum: A Meta-Regression and Moderator Analysis of Sex, Age, Training Status, and Exercise. *Sports Medicine*.](https://doi.org/10.1007/s40279-023-01937-7) Meta-analysis; 269 studies, 7,289 people. The number of reps possible at a given percentage of 1RM differs between exercises and between people, so any single formula is an approximation. [Free full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC10933212). Used by: `e1rm-estimate`, `projection-rate-of-gain`.
- [Pancar et al. (2026). Effects of deload periods in resistance training on muscle hypertrophy and strength endurance in untrained young men using a randomized within subject design. *Scientific Reports*.](https://www.nature.com/articles/s41598-026-40612-5) Trial; 19 untrained young men, 8 weeks. Limbs given reduced-volume deload weeks gained as much muscle and strength-endurance as limbs trained continuously. Used by: `deload`.
- [Pelland et al. (2026). The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains. *Sports Medicine*.](https://doi.org/10.1007/s40279-025-02344-w) Meta-analysis; 67 studies, 2,058 participants. More weekly sets produced more muscle growth with diminishing returns. Strength gains levelled off much sooner and responded to training frequency. Sets that train a muscle indirectly were counted as half a set. Used by: `tier-structure`, `weekly-volume`, `projection-dose-response`, `projection-specificity`.
- [Peos et al. (2021). Continuous versus Intermittent Dieting for Fat Loss and Fat-Free Mass Retention in Resistance-trained Adults: The ICECAP Trial. *Medicine & Science in Sports & Exercise*.](https://pubmed.ncbi.nlm.nih.gov/33587549/) Randomised trial; 61 resistance-trained adults, 12 weeks. Week-long diet breaks did not improve fat loss or lean-mass retention compared with continuous dieting. Used by: `fat-loss-stall`.
- [Robineau et al. (2016). Specific Training Effects of Concurrent Aerobic and Strength Exercises Depend on Recovery Duration. *Journal of Strength and Conditioning Research*.](https://pubmed.ncbi.nlm.nih.gov/25546450/) Trial; 58 amateur rugby players, 7 weeks. Strength gains were smaller when strength and aerobic sessions were done back to back, but not when they were 6 or 24 hours apart. Used by: `run-interference`.
- [Robinson et al. (2024). Exploring the Dose–Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta-Regressions. *Sports Medicine*.](https://doi.org/10.1007/s40279-024-02069-2) Meta-analysis; Meta-regressions of resistance training studies. Strength gains were similar whether sets stopped far from failure or close to it. Muscle growth increased as sets ended closer to failure. Used by: `t3-progression`, `accessory-progression`, `amrap-effort`.
- [Roth et al. (2022). Lean mass sparing in resistance-trained athletes during caloric restriction: the role of resistance training volume. *European Journal of Applied Physiology*.](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9012799/) Systematic review; 15 studies in resistance-trained athletes. Programs with 10 or more weekly sets per muscle group showed little or no lean-mass loss during a calorie deficit, though the evidence is not conclusive. Used by: `weekly-volume`, `accessories-in-cut`.
- [Saeterbakken et al. (2011). A comparison of muscle activity and 1-RM strength of three chest-press exercises with different stability requirements. *Journal of Sports Sciences*.](https://pubmed.ncbi.nlm.nih.gov/21225489/) Trial; Trained lifters, three bench-press variations. Dumbbell bench press 1RM was about 17% lower than barbell bench press 1RM. Used by: `dumbbell-conversion`.
- [Saeterbakken et al. (2025). Task Specificity of Dynamic Resistance Training and Its Transferability to Non-trained Isometric Muscle Strength: A Systematic Review with Meta-analysis. *Sports Medicine*.](https://doi.org/10.1007/s40279-025-02225-2) Meta-analysis; 43 studies, 1,660 people. Strength in the trained lifting task improved about twice as much (effect size 0.98) as strength in an untrained test of the same muscles (0.42). [Free full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC12296774). Used by: `projection-specificity`.
- [Schumann et al. (2022). Compatibility of Concurrent Aerobic and Strength Training for Skeletal Muscle Size and Function: An Updated Systematic Review and Meta-Analysis. *Sports Medicine*.](https://doi.org/10.1007/s40279-021-01587-7) Meta-analysis; Systematic review and meta-analysis. Combining aerobic and strength training did not compromise muscle growth or maximal strength. Used by: `run-interference`.
- [Singer et al. (2024). Give it a rest: a systematic review with Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle hypertrophy. *Frontiers in Sports and Active Living*.](https://doi.org/10.3389/fspor.2024.1429789) Meta-analysis; 9 studies. Resting longer than 60 seconds between sets gave a small muscle-growth benefit. No further benefit was detectable beyond 90 seconds. [Free full text](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/full). Used by: `rest-heavy`, `rest-light`.
- [Smith et al. (2017). Should exercises be painful in the management of chronic musculoskeletal pain? A systematic review and meta-analysis. *British Journal of Sports Medicine*.](https://doi.org/10.1136/bjsports-2016-097383) Meta-analysis; 7 trials, 385 people with chronic musculoskeletal pain. Exercise programs that allowed some pain gave a small short-term benefit over pain-free exercise, with no difference in the medium or long term. [Free full text](https://eprints.nottingham.ac.uk/41764). Used by: `training-with-pain`, `pain-load-changes`.
- [Spiering et al. (2021). Maintaining Physical Performance: The Minimal Dose of Exercise Needed to Preserve Endurance and Strength Over Time. *Journal of Strength and Conditioning Research*.](https://pubmed.ncbi.nlm.nih.gov/33629972/) Review; Narrative review. Strength can be maintained for up to 32 weeks with as little as one session a week and one set per exercise, as long as the load stays heavy. Used by: `time-off`, `deload`.
- [Steele et al. (2023). Long-Term Time-Course of Strength Adaptation to Minimal Dose Resistance Training Through Retrospective Longitudinal Growth Modeling. *Research Quarterly for Exercise and Sport*.](https://doi.org/10.1080/02701367.2022.2070592) Observational study; 14,690 adults' training records, up to 6.8 years. Strength rose quickly at first and then ever more slowly, following a log-shaped curve that had practically levelled off after 1–2 years. Used by: `projection-rate-of-gain`.
- [Stults-Kolehmainen et al. (2014). Chronic psychological stress impairs recovery of muscular function and somatic sensations over a 96-hour period. *Journal of Strength and Conditioning Research*.](https://pubmed.ncbi.nlm.nih.gov/24343323/) Trial; 31 resistance-training students. Lifters under higher life stress recovered strength more slowly over the 96 hours after a hard session. Used by: `recovery-windows`, `readiness`.
- [Zhang et al. (2021). Auto-Regulation Method vs. Fixed-Loading Method in Maximum Strength Training for Athletes: A Systematic Review and Meta-Analysis. *Frontiers in Physiology*.](https://doi.org/10.3389/fphys.2021.651112) Meta-analysis; 8 studies, 166 athletes. Adjusting the load to how the session is going produced larger maximal-strength gains than fixed, pre-planned loads. [Free full text](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7994759/). Used by: `t2-autoregulation`.

## Changelog

Changes made to the app because of research, newest first.

- **12 November 2026** — `projection-dose-response` (How much would more sets or sessions speed up my lift?): New projection screen for each lift: see where your estimated 1RM is heading and try alternatives (sessions, sets, other work for the same muscles, sessions passed, phase). Alternatives further from what you do now get a wider range. Sources: Pelland 2026, Grgic 2018b.
- **12 November 2026** — `projection-rate-of-gain` (Why does the projection curve flatten, and why is the range so wide?): The projection range now never assumes less scatter than about 2% of your estimate, so a very steady history no longer shows a range of zero. Sources: Grgic 2020, Nuzzo 2024.
- **11 November 2026** — `activity-fatigue` (Why does a hard yoga class or ride matter?): Yoga, cycling, hiking and walking can now be logged. A hard one in the last 24 hours shows a note before your next workout; it never changes weights or progression. Sources: .
- **11 November 2026** — `rate-of-loss` (How fast should I lose weight?): Gaining 0.25% of bodyweight or more a week is now reported as weight going up instead of as a stall, and several weigh-ins on one day now count as one day. Sources: .
- **11 November 2026** — `fat-loss-stall` (What should I do when weight loss stalls?): The stall check now averages several weigh-ins on one day into one, so a second weigh-in no longer shifts the weekly comparison. Sources: .
- **11 November 2026** — `t3-progression` (When does T3 weight go up?): T3 weight now goes up by 5 lb after a fully completed T3 exercise whose last set reached 25 reps. The rule existed but was never applied, so T3 weight only changed when edited by hand. Sources: .
- **11 November 2026** — `time-off` (Why lighter weights after a break?): A lift now counts as a long break after 21 days instead of 7, and suggested weight cuts after time off were reduced from 10–40% to 5–15%. Sources: Spiering 2021, Halonen 2024.
- **11 November 2026** — `amrap-effort` (How hard should the last set be?): T1 AMRAP sets now ask you to stop about 1 rep short of failure in every phase, not only while cutting. Sources: Robinson 2024, Morán-Navarro 2017.
- **11 November 2026** — `e1rm-estimate` (How is my 1RM estimated?): Estimated 1RM now accounts for logged RPE and uses only T1 sets of 10 reps or fewer. The trend arrow was also corrected: it had been reading the history backwards. Sources: Nuzzo 2024, Halperin 2022.
- **11 November 2026** — `rest-light` (Why 90 seconds after lighter sets?): Rest after T3 and accessory sets was raised from 60 to 90 seconds. Sources: Singer 2024.
- **11 November 2026** — `run-interference` (Why does a recent run matter?): The strong run advisory now applies only within 6 hours of a hard run, and suggests a lighter T1 instead of resting. Sources: Robineau 2016, Markov 2021.
- **11 November 2026** — `accessories-in-cut` (Why not fewer accessories while cutting?): The accessory cap while cutting was raised from 2 to 3, to match maintaining. Sources: Roth 2022.
