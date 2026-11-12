# Research for the e1RM projection model (November 2026)

This note records the research behind every number in
`src/lib/projection/coefficients.ts#PROJECTION_COEFFICIENTS` and the four evidence rules
that grade it (`projection-dose-response`, `projection-specificity`,
`projection-rate-of-gain`, `projection-energy-deficit`, in
`src/lib/evidence/rules/projection.ts`).

The model does not predict strength from scratch. It takes the lifter's **own measured
rate** of e1RM gain and scales it by multipliers for dose (sessions, sets), training phase
and time. So the research only has to answer *relative* questions: how much faster or slower
would the same person gain under a different dose or phase, and how fast do gains fade.
The research answers those questions in direction and rough shape. It almost never gives
the exact number the model needs, so every rule is graded `limited`. Where we had to pick,
we picked the number that under-promises.

How sources were checked: each paper's abstract was read in Europe PMC or PubMed, and the
full text where it was free (noted below). Every DOI and PubMed id was confirmed with
`npm run check:links`, which matches each id's registry title against `sources.ts`.

## Summary of coefficients

| Key | Old (placeholder) | New | Main source(s) | Grade | How much is judgment |
|---|---|---|---|---|---|
| `volumeExponent` | 0.4 | 0.1 | Pelland 2026 | limited | Derived by us from a published slope; the curve's shape is a plateau, not a power law |
| `frequencyExponent` | 0.2 | 0.2 | Pelland 2026, Grgic 2018b | limited | Half the Pelland-implied ~0.4, because a volume-equated meta-analysis found no effect |
| `relatedSetTransfer` | (new; model placeholder 0.5) | 0.4 | Pelland 2026, Saeterbakken 2025, Mattocks 2017 | limited | Rounded down from 0.5 (best of three tested credits) and ~0.43 (ratio of effect sizes) |
| `minDoseMultiplier` | 0.4 | 0.5 | Pelland 2026 | limited | Bounds read off the published curves; exact values ours |
| `maxDoseMultiplier` | 1.6 | 1.3 | Pelland 2026 | limited | As above |
| `phaseMultiplier.bulking` | 1 | 1 | (reference) | limited | Reference value |
| `phaseMultiplier.maintaining` | 0.85 | 0.95 | Helms 2023 | limited | Research shows no difference; 0.95 is a token hedge |
| `phaseMultiplier.cutting` | 0.6 | 0.8 | Murphy & Koehler 2022 | limited | Point estimate is negative but not significant; 0.8 is between null and that estimate |
| `weeklyRateRetention` | 0.97 | 0.96 | Steele 2023, Latella 2020 | limited | Fits the published log curve for ~4 months of training; one value for everyone is ours |
| `weeklySetsCeiling` | 20 | 20 | Pelland 2026 | limited | Mean + 2 SD of the studied volumes; cut-off ours |
| `bandGrowth` | 0.5 | 0.5 | none direct | limited | Judgment |
| `bandWidthSd` | 1 | 1.28 | Grgic 2020, Nuzzo 2024, Pelland 2026 | limited | Choice of an 80% range is ours |

## (a) Weekly volume and strength

**Pelland et al. 2026**, *Sports Medicine*, doi 10.1007/s40279-025-02344-w, PMID 41343037.
67 studies, 2,058 participants, Bayesian multilevel meta-regressions adjusted for
intervention length and training status. The published abstract (read in Europe PMC)
reports that volume and frequency both raise strength with diminishing returns, "the
diminishing returns for strength being considerably more pronounced" than for hypertrophy.
The publisher page blocks automated access, so the numbers below come from the free
SportRxiv v2 full text (doi 10.51224/SRXIV.460, posted 2024-10-04), whose abstract and
sample match the published paper. The published version may differ in detail.

- Sets were counted as 1 for the exact test exercise and 0.5 for other exercises training
  the same muscles ("fractional"), the same rule the app uses.
- Strength (66 studies, 490 effects, 2,020 participants): best-fitting curve reciprocal,
  "strong diminishing returns and a functional plateau". Marginal slope at the mean volume:
  **0.21% more strength gain per extra weekly set** (95% CrI 0.16–0.26%).
- Strength volumes studied: mean **8.14 ± 6.23** fractional weekly sets, median 6.
- Efficiency tiers: 1 set was the minimum effective dose; detectable increments up to about
  **4 sets**; beyond **5 sets** "additional weekly sets do not consistently enhance strength
  gains" by more than the smallest detectable effect (3.96%).
- Fixed effects explained about a quarter of the variance (R² marginal 26.1%).

**Mapping.** The contract shapes volume as a power law, multiplier = (new/old)^k, so k is the
elasticity d ln(gain)/d ln(sets). At the mean, elasticity = slope × sets ÷ gain
= 0.21 × 8.14 ÷ ~17 ≈ **0.10** (gain at mean taken as ~17%, the paper's control-adjusted
estimate at 2 sessions a week). On a reciprocal curve the elasticity falls as volume rises
(our reconstruction gives ~0.2 at 4 sets and ~0.05 at 16), so 0.1 slightly over-states the
benefit for GZCLP lifters, who typically do more than 8 sets, and slightly under-states the
loss from dropping below 4. **Leap: moderate.** The slope is published; the conversion to an
exponent and the gain at the mean are ours.

`weeklySetsCeiling` = 20: about the mean + 2 SD of the volumes in the strength dataset,
so beyond it the model would be extrapolating; the strength curve is already flat well
before it. **Leap: the number is ours.**

`minDoseMultiplier` / `maxDoseMultiplier`: the reciprocal frequency curve gains about a third
from 1 to 2 sessions and only a few percent beyond 3; volume is flat past ~5 sets. So no
dose change in the evidence multiplies the rate by more than ~1.3. Going down, 1 session
instead of 2 gives 12.7/17.3 ≈ 0.73, and 2 sets instead of 10 roughly 0.7 on our
reconstruction. With the chosen exponents the bounds rarely bind; they are guards.

## (b) Frequency and strength

**Pelland et al. 2026** (as above): strength rose with weekly fractional frequency after
adjusting for volume; reciprocal best fit; marginal slope **3.27% per extra session** (95%
CrI 2.74–3.84%) at the mean of 1.97 sessions; control-adjusted gain **12.72%** at 1 session
and **17.32%** at 2. The authors note practice on the test lift likely contributes.

**Grgic et al. 2018b**, *Sports Medicine*, doi 10.1007/s40279-018-0872-x, PMID 29470825.
22 studies. Effect sizes rose from 0.74 (1×/week) to 0.82, 0.93 and 1.08 (4+×/week), but in
**volume-equated** studies the effect of frequency was **not significant (p = 0.421)**.

**ACSM 2026** position stand (already in the registry) recommends at least 2 sessions a week
for strength; it supports direction only.

**Mapping.** Pelland's 1→2 sessions ratio (17.32/12.72 = 1.36) implies an exponent of
ln 1.36 / ln 2 ≈ 0.44; the slope at the mean gives 3.27 × 1.97 / 17.3 ≈ 0.37. Grgic's
volume-equated subgroup is compatible with zero. We use **0.2**, about half the Pelland
figure. **Leap: large.** The direction is well supported, the size is contested.

## (c) Rate of strength gain over time

**Steele et al. 2023**, *Research Quarterly for Exercise and Sport*,
doi 10.1080/02701367.2022.2070592, PMID 35591809. Retrospective records of **14,690** adults
(mean age 48) doing minimal-dose machine training (1×/week, single sets to failure) for up to
6.8 years. Strength followed a **linear-log** curve; the rate of change trended toward zero so
that "by ~1-2 years strength had practically reached a plateau"; ~30–50% gain in year one.

**Latella et al. 2020**, *J Strength Cond Res*, doi 10.1519/JSC.0000000000003657, PMID
32865942 (free full text in PMC). **1,897** powerlifters over 15 years: the strongest men
gained **0.102 kg/day** against **0.211 kg/day** for the least strong.

**Mapping.** On a linear-log curve the rate after t weeks of training is proportional to 1/t,
so over the next w weeks it shrinks by t/(t + w). As a constant weekly retention over a
12-week horizon this is ≈0.94 at 3 months of training, ≈0.97 at 6 months and ≈0.98 at a
year. The contract has one value for everyone, so we use **0.96** (fits ~4 months), which
under-promises for anyone trained longer and halves the rate in about 17 weeks. **Leap:
moderate to large.** Steele's population (older, minimal dose, machines) is not a GZCLP
lifter, and the right value depends on training age, which the contract does not take.

## (d) Energy deficit and surplus

**Murphy & Koehler 2022**, *Scand J Med Sci Sports*, doi 10.1111/sms.14075, PMID 34623696
(already in the registry). Randomised trials of resistance training in an energy deficit for
3 weeks or more, mostly untrained people. Against parallel controls, lean-mass gains were
impaired (ES −0.57, p = 0.02) but strength gains were **comparable (ES −0.31, p = 0.28)**; in
matched comparisons strength ES was 0.84 in deficit and 0.81 without. A ~500 kcal/day
deficit prevented lean-mass gain.

**Helms et al. 2023**, *Sports Medicine – Open*, doi 10.1186/s40798-023-00651-y, PMID
37914977 (free full text in PMC). 21 trained lifters randomised to maintenance, +5% or +15%
energy for 8 weeks; 17 finished. No evidence for a group effect on **squat 1RM** or muscle
thickness; bench 1RM favoured the 15% group in the group comparison, but in the regression
bodyweight change did not predict 1RM change; faster gain mainly added skinfold thickness.

**Mapping.** The research supports a small or no strength penalty for cutting and no clear
benefit from a surplus. We set cutting **0.8** (between no effect and the negative point
estimate), maintaining **0.95** (a token value so the model never promises more at
maintenance than in a surplus), bulking 1. Since the multiplier is relative (scenario phase
over the phase the baseline was measured in), smaller gaps also keep "switch to bulking"
scenarios from over-promising. **Leap: large.** No paper gives a strength multiplier per
phase; the deficit evidence is mostly untrained people.

## (e) Reliability of 1RM and e1RM, and the width of the range

**Grgic et al. 2020**, *Sports Medicine – Open*, doi 10.1186/s40798-020-00260-z, PMID
32681399 (free full text in PMC). 32 studies, 1,595 people: test-retest ICC median 0.97, but
coefficient of variation **median 4.2% (range 0.5–12.1%)** between sessions.

**Nuzzo et al. 2024** (already in the registry): reps possible at a given %1RM vary between
people and exercises, so a reps-based estimate carries extra error beyond a tested 1RM.

**Mapping.** The model's range is built on the residual SD of the lifter's own e1RM series,
which already contains this day-to-day noise; that is the right base. `bandWidthSd` = **1.28**
makes the range roughly an 80% interval instead of 68%, because the dose-response models also
explain only about a quarter of between-study variance (Pelland) and the multipliers above
are uncertain. `bandGrowth` = **0.5** (range ≈ 2.7× residual SD at 12 weeks) has no direct
source; it stands for uncertainty in the future rate. **Leap: the growth term is judgment.**

## (f) Specificity: do other exercises for the same muscles count?

Added at the lead's request, for the `relatedSetTransfer` key.

**Pelland et al. 2026** (SportRxiv v2 full text): for strength, "direct" sets were the exact
test exercise and "indirect" sets any exercise meaningfully training the muscles involved.
Indirect sets were counted as 0, 0.5 or 1. For weekly volume and strength, 0.5 was very
strongly favoured over 0 (2 × log BF = 45.96) and over 1 (18.21); likewise for frequency. Only
those three values were tested. (A companion per-session preprint by the same group,
Remmert et al. 2025, SportRxiv, not peer reviewed, found the opposite for per-session volume:
counting only direct sets fitted best. It is not cited in the registry.)

**Saeterbakken et al. 2025**, *Sports Medicine*, doi 10.1007/s40279-025-02225-2, PMID
40314751 (free full text in PMC). 43 studies, 1,660 people: dynamic training raised dynamic
(trained-task) strength with SMD **0.98** but untrained isometric strength only **0.42**; changes
in muscle size did not predict either.

**Mattocks et al. 2017**, *Med Sci Sports Exerc*, doi 10.1249/MSS.0000000000001300, PMID
28463902. 38 untrained adults, 8 weeks: practising 1RM attempts alone raised 1RM as much as
four sets to failure, although the high-volume group grew more muscle.

**Mapping.** Pelland supports half credit as the best of three options; Saeterbakken's ratio
(0.42/0.98 ≈ 0.43) points the same way, though for isometric tests rather than another
barbell lift; Mattocks shows practising the lift itself matters most. We use **0.4**, rounded
down. **Leap: moderate.** The direction (partial transfer) is clear; the number is not
measured for lift-to-lift transfer. Recorded as its own rule, `projection-specificity`.

## Where the contract's shape does not match the research

- **Volume as a power law.** Strength follows a reciprocal curve with a plateau. A single
  exponent over-states gains from extra sets at high baselines and under-states losses at very
  low volumes. A reciprocal or saturating form (gain ∝ a − b/sets) would fit the evidence
  better.
- **One weekly retention for everyone.** The evidence says gains slow as 1/(training age).
  A retention that depends on training age (t/(t + w)) would be more honest; the single value
  is a compromise.
- **Frequency and specificity overlap.** Part of the frequency effect is practising the
  lift. The model applies both multipliers independently, which may double-count a little;
  the conservative exponents allow for this.
- **The uncertainty in the multipliers themselves is not in the range.** The band grows
  with the horizon but does not widen more for scenarios far from the baseline, even though
  the frequency exponent could plausibly be anywhere from 0 to ~0.4. (Addressed in part by
  `scenarioUncertainty`, below.)

## Addendum (November 2026, projection screen): two range coefficients

Added when the projection screen was built. Both shape only the width of the range, never
the projected value.

| Key | Value | Source | Grade | How much is judgment |
|---|---|---|---|---|
| `minResidualSdFraction` | 0.021 | Grgic 2020, Nuzzo 2024 (question (e)) | limited | The choice of the median CV and of the minimum point count |
| `scenarioUncertainty` | 0.5 | none direct | limited | Entirely judgment |

**`minResidualSdFraction` = 0.021.** An exactly linear e1RM history (common early in
GZCLP, when the weight rises every session at the same reps) gives a residual SD of 0 and
a zero-width range, which claims a certainty no estimate has. The SD behind the range is
now max(residual SD, 0.021 × current e1RM). From (e): a tested 1RM varies between
sessions by a median CV of **4.2%** (Grgic 2020), and estimates from rep sets add error on
top (Nuzzo 2024). The trend's level rests on at least four results (`MIN_TREND_POINTS`), and
the error of a mean of four measurements is half that of one: 4.2% / √4 = **2.1%**. Using
the single-test median rather than an e1RM-specific figure (none was found) under-states
the floor a little, so it binds only when the lifter's own results are steadier than a
tested 1RM. With the demo squat (residual SD about 1.5% of its e1RM) the floor binds.
Tagged `projection-rate-of-gain`. **Leap: moderate.**

**`scenarioUncertainty` = 0.5.** The range is multiplied by
1 + 0.5 × |ln(total rate multiplier)|, exactly 1 for an unchanged scenario (and capped at
2 by a code guard for a multiplier near zero). No research gives this number. It encodes
the limit above: the exponents could be about half to double their values, so the further a
scenario moves the rate, the less sure the result. 0.5 keeps it modest: about +3% width for
2 sessions a week instead of 1.5, +9% for cutting instead of maintaining, and at most about
+45% for the largest increase the other bounds allow. Tagged `projection-dose-response`.
**Leap: the number is judgment.**

The known limits of the curve shape (power law instead of a plateau) and the single
retention rate are unchanged, and the projection screen states both in plain words.
