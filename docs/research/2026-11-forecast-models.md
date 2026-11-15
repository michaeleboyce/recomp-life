# Research for the stored forecasts (November 2026)

This note records the research behind the constants in `src/lib/forecast/coefficients.ts`
and the four evidence rules that grade them (`forecast-reps`, `forecast-session-length`,
`forecast-bodyweight`, `forecast-calibration`, in `src/lib/evidence/rules/forecast.ts`).
All four rules stay `planned` until the forecast screens ship.

The forecasts are personal: each one is built from the lifter's own history and then scored
against what happens, and a kind whose ranges hold too few results is widened. So the
research mainly has to answer two questions: how much does a single result scatter around a
person's true level (which sets the smallest range the app should ever give), and over what
horizon does a simple trend hold. The literature answers both in rough size for reps and
bodyweight, and not at all for session length or for converting a readiness score into
strength.

How sources were checked: each paper's abstract was read in Europe PMC, and the full text
where it was free (Mitter 2022, Craven 2022, Turicchi 2020; noted below). Every DOI and
PubMed id was confirmed with `npm run check:links`, which matches each id's registry title
against `sources.ts`. Nothing below is quoted from a paper that was not opened.

## Grades

| Rule | Grade | Why |
|---|---|---|
| `forecast-reps` | limited | Rep scatter and the low-rep accuracy of max estimates are measured, but in lab tests of fresh sets (mostly bench press); the cold-start values, the 1.5×, the cutting shift, the readiness conversion and the normal shape are ours |
| `forecast-session-length` | heuristic | No research found; no sources |
| `forecast-bodyweight` | limited | Daily scatter, the weekly cycle and the slow response of weight are measured or modelled, but in one man, in weight-loss maintainers and in a population model, not lifters on a cut |
| `forecast-calibration` | heuristic | A statistical method, not training research; thresholds are ours; no sources |

## Recommended values

"Keep" means the current value is supported or harmless; "assumption" means no source gives
the number.

| Key | Current | Recommended | Basis |
|---|---|---|---|
| `REPS_MODEL.minTrendPoints` | 4 | 4 | assumption |
| `REPS_MODEL.trendWindowWeeks` | 8 | 8 | assumption |
| `REPS_MODEL.trendSdFloorFraction` | 0.042 | **0.03** | Mitter 2022 (≈2.0–2.6% in trained lifters), rounded up for real sessions (assumption); Grgic 2020 4.2% is an upper reference |
| `REPS_MODEL.fewPointsSdFloorFraction` | 0.06 | **0.045** | derived from the Mitter scatter (see (a) and "Calibration on simulated lifters"); at 0.06 these ranges held 97% of simulated results |
| `REPS_MODEL.priorSdFraction` | 0.1 | 0.1 | assumption |
| `REPS_MODEL.priorRepsAboveTarget` | 2 | **5** | the program's own starting-weight guidance, not a study (see "Calibration on simulated lifters") |
| `REPS_MODEL.regimeChangeSdMultiplier` | 1.5 | 1.5 | assumption |
| `REPS_MODEL.regimeChangeWeeksOff` | 3 | 3 | assumption |
| `REPS_MODEL.cuttingLevelShift` | −0.01 | −0.01 | assumption (no study of acute strength in a deficit found) |
| `REPS_MODEL.readinessLevelShiftPerPoint` | 0.0005 | 0.0005, plus a cap: shift between **−0.03 and +0.01** | Craven 2022 for the size of a sleep-loss effect; the points-to-percent conversion and cap are assumptions (see (c)) |
| `REPS_MODEL.maxReps` | 12 | 12 | assumption; see (b) on fitting from sets above 10 reps |
| `NEW_BEST_MODEL.effortCreditRecentSets` | (new) | 5 | assumption (see "The chance of a new best" under "Calibration on simulated lifters") |
| `SESSION_LENGTH_MODEL.secondsPerSet` | 45 | 45 | assumption |
| `SESSION_LENGTH_MODEL.minSessionsForCorrection` | 3 | 3 | assumption |
| `SESSION_LENGTH_MODEL.defaultRangeFraction` | 0.15 | 0.15 | assumption |
| `BODYWEIGHT_MODEL.horizonDays` | 28 | 28 | Hall 2011 (straight line holds well over weeks) |
| `BODYWEIGHT_MODEL.fitWindowDays` | 28 | 28 | Turicchi 2020 (covers four weekly cycles); length is ours |
| `BODYWEIGHT_MODEL.minEntries` | 6 | 6 | assumption; see (d) |
| `BODYWEIGHT_MODEL.outcomeWindowDays` | 3 | 3 | Turicchi 2020: ±3 days is a full week, which averages out the weekend swing |
| `BODYWEIGHT_MODEL.minOutcomeEntries` | 2 | 2 | assumption |
| `CALIBRATION.targetCoverage` | 0.8 | 0.8 | assumption (choice of an 80% range) |
| `CALIBRATION.rangeZ` | 1.2816 | 1.2816 | exact normal quantile for 80% |
| `CALIBRATION.minResolvedForCorrection` | 20 | **30** | binomial arithmetic, see (e) |
| `CALIBRATION.widenBelowCoverage` | 0.7 | 0.7 | binomial arithmetic, see (e) |
| `CALIBRATION.sdScaleMin` | 1 | 1 (consider < 1 later) | assumption, see (e) |
| `CALIBRATION.sdScaleMax` / `sdScaleStep` | 2 / 0.15 | 2 / 0.15 | assumption |

The rule text reads every number from the constants, so adopting a recommendation changes
the text with it. Changing `trendSdFloorFraction`, `minResolvedForCorrection` or adding the
readiness cap is a behaviour change and needs a changelog entry when the rules go active.

## (a) How much do reps at a fixed load vary from session to session?

**Mitter et al. 2022**, *PLoS One*, doi 10.1371/journal.pone.0268074, PMID 35511896 (free
full text, PMC9070879). 24 resistance-trained adults (15 men, 9 women; bench press 1RM about
1.2 × bodyweight). 1RM, then reps to failure at 90%, 80% and 70% of 1RM on a separate day,
all repeated one week later (loads recalculated from the retest 1RM). Table 1:

| Load | Reps (test) | SEM (reps) | Within-subject CV of reps | ICC |
|---|---|---|---|---|
| 90% | 4.2 ± 1.2 | 0.7 | 15.9% | 0.65 |
| 80% | 7.8 ± 1.7 | 0.7 | 9.2% | 0.82 |
| 70% | 12.2 ± 2.6 | 1.1 | 8.8% | 0.86 |
| 1RM | 93.5 ± 28.9 kg | 1.7 kg | 1.8% | 1.00 |

Reps rose slightly on retest (0.2 to 0.7 reps), a practice or training effect.

**Grgic et al. 2020** (already in the registry), *Sports Medicine – Open*, PMID 32681399. 32
studies, 1,595 people: 1RM test-retest CV median **4.2%** (range 0.5–12.1%). The pooled
studies include people without training experience and older adults; the review found
reliability good in all those groups, but did not give a trained-only CV in the abstract.

**Mapping.** The app's index is `x = w × (1 + r/30)`. A change of σ reps at weight w moves the
index by w·σ/30, which is σ/(30 + r) as a fraction of the index. From Mitter: 0.7/34.2 =
**2.0%** at 90%, 0.7/37.8 = **1.9%** at 80%, 1.1/42.2 = **2.6%** at 70%. That is the session-to-
session scatter of the index in trained lifters under lab conditions (fresh sets in a lab,
one week apart). A GZCLP last set comes after the earlier sets of the session, on
whatever day the lifter trains, so real scatter is larger; Grgic's 4.2% (mixed populations,
tested 1RM) is a sensible upper reference.

- **`trendSdFloorFraction`: recommend 0.03.** The floor only binds when a lifter's own residual
  scatter is smaller than it, so it should sit near the smallest scatter a trained lifter
  really has, not the average. 0.042 is the 1RM median from mixed populations and is above
  every Mitter figure. Because the calibration loop can only widen ranges (`sdScaleMin` 1), a
  floor that is too high gives ranges that hold more than 80% and are never corrected. 0.03 is
  the Mitter range rounded up for real-session conditions. **Leap: moderate.** One bench-press
  study; the rounding is ours. If the lead prefers to stay cautious, 0.042 is defensible as an
  upper bound and the rule text adapts either way.
- **`fewPointsSdFloorFraction`: keep 0.06 (assumption).** With n results the error of their
  mean adds to the scatter of the next result: σ√(1 + 1/n), which is 1.41σ for one result and
  1.15σ for three. At σ = 0.03 that is 0.042 for one result. The average of up to eight weeks
  of results also lags a lifter who is still gaining (GZCLP adds weight most sessions), which
  adds a bias of a few percent. Combining 0.042 with a 3% lag gives about 0.05; 0.06 leaves a
  margin. No study measures this. **Since lowered to 0.045**, after the simulation below
  showed 0.06 was too wide; the model now also carries part of the bar's weight increase
  into these results, which takes most of the lag out.
- **`priorSdFraction` 0.1, `priorRepsAboveTarget` 2, `regimeChangeSdMultiplier` 1.5,
  `regimeChangeWeeksOff` 3, `minTrendPoints` 4, `trendWindowWeeks` 8:** no source; keep as
  assumptions. Mitter's retest gain (up to 0.7 reps in a week) supports making the scatter
  wider, not narrower, after a change of routine, but gives no multiplier.
  **`priorRepsAboveTarget` has since been raised to 5**; see "Calibration on simulated
  lifters".

## (b) How accurate are rep-based estimates of a max at low reps?

**Reynolds et al. 2006**, *J Strength Cond Res*, doi 10.1519/R-15304.1, PMID 16937972
(abstract). 70 adults aged 18–69 did 1, 5, 10 and 20RM on bench (chest) press and leg press.
Load fell non-linearly with reps. **5RM data predicted 1RM best** (R² 0.993 chest press,
0.974 leg press; standard error 2.98 kg and 16.16 kg), less well from 10 and 20RM; the authors
conclude "no more than 10 repetitions should be used in linear equations to estimate 1RM".

**Mayhew et al. 2008**, *J Strength Cond Res*, doi 10.1519/JSC.0b013e31817b02ad, PMID
18714230 (abstract). 103 young women, bench press reps to fatigue at 60–90% of 1RM before
and after 12 weeks of training. Prediction equations were **more accurate when fewer than 10
reps** were done, before and after training; individual changes in reps at the same relative
load after training were large.

**Nuzzo et al. 2024** (already in the registry): reps possible at a given %1RM differ between
exercises and people, so any one formula is an approximation.

**Mapping.** The Epley index is linear in reps, the kind of equation Reynolds says to use only
up to 10 reps. T1 last sets in GZCLP are mostly 1 to 10 reps, so pooling them is within the
range where these estimates hold best. Because the forecast compares a lifter only with
their own past sets, a fixed bias of the formula for that lifter and lift largely cancels; what
does not cancel is pooling sets of very different rep counts (stage 1 versus stage 3).
- **`maxReps` 12: keep.** It only caps the outcome buckets. Recommend (assumption) that the
  forecast-models package excludes or down-weights *history* sets above 10 reps when fitting
  the level, or at least records the count of such points in `inputs`.
- The stage-change scatter multiplier is the right place to absorb the extra error from
  pooling across stages. No source gives its size.

## (c) How much does one short night reduce strength?

**Craven et al. 2022** (already in the registry), *Sports Medicine*, PMID 35708888 (free full
text, PMC9584849). 69 publications, 227 outcomes, 89% of participants male. Sleep loss was
≤ 6 h in 24 h. Overall performance fell 7.56%. For **strength** (66 outcomes): **−2.85%**
(95% CI −4.47 to −1.23). By protocol: total deprivation −3.00% (significant), early
restriction (late to bed) −1.16% (CI crosses zero), late restriction (early waking) −4.45%
(CI crosses zero). Lower body −3.42% (significant), upper body −1.63% (not significant).
Strength-endurance (reps to failure, only 9 outcomes) −9.85%, unstable in leave-one-out
analyses. Performance fell about 0.4% per extra hour awake before the task; morning tasks
were largely unaffected. The registry's `finding` now also states the strength figure.

**Mapping.** A short night costs a lifter roughly 1–3% of strength on average, more for
squats and deadlifts and when training late in the day, with no reliable effect for a night
that is only cut short by going to bed late. A 3% drop in level is about 1.1 reps on an
8-rep last set (0.03 × 38).

`readinessLevelShiftPerPoint` turns readiness points into a level shift, and the points come
from `READINESS_WEIGHTS` (readiness package, being built in parallel; only `defaultUsual` = 70
exists at this commit). With 0.0005, a 20-point drop moves the level by 1% and a 40-point drop
by 2%, which sits inside Craven's range for the kind of night the readiness check describes.
- **Keep 0.0005 (assumption)** provided a single short night (under 6 hours) costs roughly
  20–40 points in the readiness score. If the readiness package gives it far more or fewer
  points, rescale so that night maps to about −1% to −2%.
- **Add a cap (assumption): shift between −0.03 and +0.01.** −3% is about the deprivation
  figure; nothing in the evidence supports a larger penalty from readiness alone. The studies
  compare sleep loss with normal sleep, so there is **no evidence that a better-than-usual
  score raises strength**; a small upward cap keeps the model nearly one-sided.
- The readiness score also mixes stress, soreness and recent training, which Craven does not
  cover; their share of the shift is unsupported.

`cuttingLevelShift` −0.01: no study of the acute effect of being in a calorie deficit on the
day's strength was found (the deficit research in the registry, Murphy & Koehler 2022, is
about gains over weeks). Keep as an assumption; it is small.

## (d) How much does daily bodyweight bounce around its trend, and does a straight line hold?

**Schneditz et al. 2023**, *Renal Failure*, doi 10.1080/0886022X.2023.2273421, PMID 37955103
(abstract). One healthy man, 9,521 days of standardised morning weigh-ins. Relative difference
between consecutive days: mean 0, **SD 0.53%**; for 7 days apart, 0.69%; stable over the whole
period. (If day-to-day noise were independent, single-weigh-in noise would be about
0.53/√2 ≈ 0.37%; the authors do not report this.)

**Turicchi et al. 2020**, *PLoS One*, doi 10.1371/journal.pone.0232152, PMID 32353079 (free
full text, PMC7192384). NoHoW weight-loss maintenance trial, 1,421 adults for the weekly
analysis, connected scales. After LOESS detrending: **within-week fluctuation 0.35%**, highest
Monday, lowest Friday (men 0.41%, women 0.29%). Christmas added about 1.35%. The per-day SDs
in Table 2 are near 1% but describe spread across people, and the paper does not state how
the 0.35% is defined; not used.

**Orsama et al. 2014** (*Obesity Facts*, PMID 24504358) found the same weekend-high pattern in
80 adults but reports it only in normalised units, so it is not cited.

**Hall et al. 2011**, *The Lancet*, doi 10.1016/S0140-6736(11)60812-X, PMID 21872751
(abstract). A mathematical model of adult energy balance: bodyweight responds to a
lasting change of intake with **half-times of about 1 year**.

**Mapping.**
- **Noise.** About 0.4–0.5% of bodyweight per weigh-in (0.7–0.9 lb at 180 lb), plus a weekly
  cycle of about 0.35%. The forecast's range comes from the lifter's own residual scatter, so
  no floor constant is needed, but a floor of about 0.4% of bodyweight (assumption, from
  Schneditz) would stop a lucky run of steady weigh-ins giving a near-zero range; suggested to
  the forecast-models package, not a current constant.
- **`outcomeWindowDays` 3: keep.** ±3 days is a full week, which averages out the weekend swing
  and reduces single-weigh-in noise by √(number of weigh-ins).
- **`fitWindowDays` 28: keep.** Four weekly cycles, so the slope is not tilted by where the
  weekends fall. Fewer days would let the weekly cycle and noise dominate the slope.
- **`horizonDays` 28: keep.** With a half-time near a year, the rate of change falls by about
  1 − 2^(−6/52) ≈ 8% between the middle of the fit window and the end of the horizon (six
  weeks). For a 1 lb/week loss that is an error of about 0.2 lb at four weeks, far below the
  noise. The straight line fails mainly when the lifter changes what they eat or switches
  phase, which the model cannot see. Hall's model is of average adults, not lean lifters, and
  does not cover the faster water and glycogen changes in the first days of a diet (not
  verified from these sources, so not in the rule).
- **`minEntries` 6: keep (assumption).** With noise σ ≈ 0.45% and six weigh-ins spread over
  28 days, the standard error of the line at 28 days ahead (42 days from the centre of the
  data) is roughly 2σ ≈ 1% of bodyweight; with all six in one week it is far worse. Suggest
  (assumption) also requiring the entries to span at least 14 days.
- **`minOutcomeEntries` 2: keep (assumption).**

## (e) Calibration

No training research applies: this is how any probabilistic forecast is checked (stated
chances should match observed frequencies). The rule stays `heuristic` with no sources.

- `rangeZ` 1.2816 is the exact standard-normal quantile for a central 80% range.
- **`minResolvedForCorrection`: recommend 30.** With 20 scored forecasts and true coverage of
  80%, the chance of seeing fewer than 70% inside (13 or fewer of 20) is about **8.7%**, so
  roughly one correctly-sized kind in eleven would be widened by chance at each check. At 30 it
  is 6.1%, at 50 about 3.1%. If the share is re-checked after every new result, false
  widening becomes more likely still; the scorer should check on a rolling window or only
  every N results (assumption). At 20 results, a kind that truly holds only 60% is caught
  75% of the time; at 30, 82%.
- **`sdScaleMin` 1.** Combined with the trend floor, a one-way correction means ranges that
  are too wide are never narrowed. Worth revisiting once there is data (narrow when coverage is
  above about 0.9 with enough results).
- `widenBelowCoverage` 0.7, `sdScaleMax` 2, `sdScaleStep` 0.15, `targetCoverage` 0.8: keep;
  choices, not measured values.

## Session length

No research found on predicting a strength session's duration from planned sets and rests.
The rule stays `heuristic` with no sources. `secondsPerSet` 45 (covers unracking and a set of
1 to 10 reps), `minSessionsForCorrection` 3 and `defaultRangeFraction` 0.15 are assumptions;
the correction from the user's own sessions is what makes the forecast fit.

## What stays unverified

- Rep scatter for the squat, deadlift and overhead press, and for sets done after other work
  sets: only a bench-press lab study was found.
- Any measured link between a self-reported readiness score and the day's strength.
- The acute strength cost of being in a calorie deficit on the day.
- Bodyweight day-to-day noise in a group of lifters (the best figure is one man).
- Whether reps at a fixed load are normally distributed around a person's level; the normal
  shape is a modelling choice.

## Calibration on simulated lifters

Added after the models were built. This is a check of the arithmetic, not evidence about
real lifters: **the lifters are simulated from this app's own assumptions** (a strength
level that grows steadily, bell-shaped day-to-day scatter, the rep-max relation in
`src/lib/e1rm.ts`). It can show that a range is sized wrongly for the lifter the model
assumes. It cannot show that real lifters behave that way. The stored track record, scored
against what users actually log, is what will show real calibration.

**Set-up** (`src/lib/forecast/replay.test.ts`, "ranges hold what they say, pooled over
simulated lifters"). Twelve lifters, 64 workouts each, run through the real program rules:
seeds 1 to 12, starting 3, 5 or 7 reps over the target at the starting weights, gaining 1%
or 2% a week, with session-to-session variation of 2.5% of their level (the middle of the
Mitter range in (a)). Each workout is forecast from the workouts before it and scored
against what the lifter then did. The pool is the 1,261 resolved 80% ranges for reps on the
last set and for the estimated max four weeks on. Session lengths are left out because
nothing in the simulation varies them. The test requires 74% to 88% of results inside the
ranges overall, and 72% to 90% for forecasts built on a trend. The demo history has only
about 50 ranges, where a correctly sized range shows anything from 69% to 91% by chance,
so it is kept only as a sanity bound.

**Result.** Share of results inside the 80% range, before and after two constants changed:

| Basis of the forecast | Before | After |
|---|---|---|
| All | 89.1% (1,124 of 1,261) | 87.2% (1,099) |
| No results yet (`prior`) | 68.8% (33 of 48) | 100% (48 of 48) |
| One to three results (`persistence`) | 97.0% (323 of 333) | 88.6% (295) |
| Four or more (`trend`) | 86.7% (664 of 766) | 86.7% (664) |
| After a stage change, reset or break (`regime-change`) | 91.2% (104 of 114) | 80.7% (92) |

Before, the pool was above the 88% ceiling; after, it passes. The two changes:

- **`fewPointsSdFloorFraction` 0.06 → 0.045.** With session-to-session variation of about
  2.5% of the level, the next result spreads around the mean of n earlier ones by
  2.5% × √(1 + 1/n): 3.5% from one result, 2.9% from three. 4.5% keeps a margin for the level
  also moving between sessions. Because the calibration loop can only widen a range, a floor
  that starts too wide is never corrected, which is the same argument as for the trend floor
  in (a). **Grade: heuristic, derived from a cited figure (Mitter 2022).** The same floor,
  times `regimeChangeSdMultiplier`, sizes the range after a stage change, reset or break,
  so that row moved too.
- **`priorRepsAboveTarget` 2 → 5.** GZCLP's own guidance is to start the T1 lifts at about
  85% of a five-rep max, roughly three quarters of a one-rep max, and to stop the last set
  with one or two reps left (read on the program's page at
  https://www.liftosaur.com/programs/gzclp, which describes Cody Lefever's program). Three
  quarters of a max is about ten reps fresh and all-out, so about eight on the last of five
  sets stopped short, which is five over a 3-rep target. In the simulation, first-session
  forecasts ran 3.2 reps low before the change (1.4, 3.1 and 5.1 low for lifters starting 3,
  5 and 7 over the target) and 0.2 low after (1.6 high, 0.1 low, 2.1 low). That figure only
  mirrors the starting strength given to the simulated lifters, so it supports the value
  no further than the guidance does. **Grade: heuristic (program guidance, not a study).**

**The chance of a new best** (added after review; `replay.test.ts`, "new-best chances match
the app's new bests"). The forecast was first scored on logged reps alone, while the app's
own new best counts the reps a logged effort says were left (`calculateE1RM`) and keeps no
estimate for a set of more than 10 reps. Six reps logged as RPE 8 showed a new best in the
app and scored a miss. The event is now the app's own: the workout's estimated max for the
lift is above the best that stood when the forecast was made, and that best is stored on
the row. The stated chance assumes the lifter's usual effort credit on the last set: the
middle value over their latest five last sets (`NEW_BEST_MODEL.effortCreditRecentSets`), a
set logged without an effort counting as none. No study covers how steadily a lifter rates
a last set. **Grade: heuristic.**

The same twelve lifters, logging no effort and then RPE 9, 8 or 7 on every last set.
Stated chance against how often the app's new best happened:

| Effort logged | All (714) | On a trend (281) | One to three results (327) | After a change (106) |
|---|---|---|---|---|
| None | 53.9% stated, 54.6% happened | 57.6%, 54.8% | 56.4%, 54.1% | 36.2%, 55.7% |
| RPE 9 | 54.8%, 56.2% | 59.1%, 56.9% | 57.2%, 55.0% | 36.4%, 57.5% |
| RPE 8 | 55.5%, 57.6% | 60.3%, 59.4% | 57.5%, 56.6% | 36.4%, 55.7% |
| RPE 7 | 55.9%, 58.4% | 61.1%, 60.9% | 58.1%, 57.5% | 35.5%, 54.7% |

Logging an effort does not change how well the chance is stated. Scored on logged reps
alone, the RPE 8 lifters would have shown a new best in under 20% of workouts while the
app showed one in 58%.

What this does not fix, and is the reps model's own: after a stage change, reset or break
the chance is understated by about 20 points in every row. And the pool hides opposite
errors by lifter: twelve lifters who all gain 1% a week from 5 reps over the target had a
new best 41% to 44% of the time on one to three results against a stated 56%, while the
demo lifter (2% a week, 9 reps over) had one in 13 of 15 workouts against a stated 57%.
With one to three results the model cannot yet tell a fast gainer from a slow one.

**What the table still shows.** Ranges with no results yet now hold every simulated
result: `priorSdFraction` 0.1 is wide for lifters who start as the program advises, and was
left alone because a first session is where the app knows least. Ranges built on one to
three results (88.6%) are still a little wide.
