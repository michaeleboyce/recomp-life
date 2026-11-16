# Research for one strength model across gym and home (November 2026)

This note records the research behind the constants in `src/lib/strength/coefficients.ts`
and the three evidence rules that grade them (`transfer-ratio`, `strength-pooling`,
`drop-set-evidence`, in `src/lib/evidence/rules/strength.ts`). All three stay `planned`
until the strength model is wired into re-entry, the home lift page, new bests and the
"why" trace (spec: `docs/plans/2026-11-15-strength-model-design.md`, H4, H5, H13 and
decision 3).

The model treats every set, gym or home, as evidence about the strength of the program
lift it stands in for. That needs three numbers the literature might supply: how a home
exercise's maximum compares with the barbell lift's (the ratio), how much a home session
should count toward the barbell estimate (the pooling weight), and how far a drop set
understates strength (the fatigue allowance). The literature gives the first for three of
the nine pairs, in one small study each, and gives the direction but not the size of the
third. It says nothing about the second.

How sources were checked: each paper's abstract was read in Europe PMC. Full text was read
for Speirs 2016 (the journal PDF), Sødal 2023 (PMC10390395) and Havers 2026 (PMC13043944,
through Europe PMC). Saeterbakken 2011 and Saeterbakken & Fimland 2013 are paywalled, so
only their abstracts were read; nothing below comes from their full text. DOIs and PubMed
ids were checked with `npm run check:links` (all four new sources verified against Crossref
and PubMed, all links reachable). Papers seen only in search listings are not named below.
No personal or training data was sent to any service; searches used only exercise names
and study terms.

## Grades

| Rule | Grade | Why |
|---|---|---|
| `transfer-ratio` | limited | Three pairs (dumbbell bench, standing dumbbell shoulder press, split squat) rest on one small study each; the other six starting ratios are assumptions, and every ratio is then learned from the lifter's own sessions |
| `strength-pooling` | heuristic | No research on how much a related exercise's estimate tells about a lift's strength; no sources |
| `drop-set-evidence` | limited | Meta-analyses show drop sets are more fatiguing in the moment and give similar long-term gains; the fatigue allowance, its weight and the half-set credit are judgments |

Graded per pair, in `TRANSFER_PRIORS` (each entry carries its own `grade` and `sources`):

| Program lift | Home exercise | Starting ratio | Grade | Basis |
|---|---|---|---|---|
| Bench press | DB bench press | 0.83 | limited | Saeterbakken 2011 |
| Bench press | DB floor press | 0.83 | heuristic | assumed equal to the DB bench press |
| Overhead press | DB shoulder press (standing) | 0.93 | limited | Saeterbakken & Fimland 2013 |
| Overhead press | DB Arnold press | 0.80 | heuristic | assumption |
| Squat | Bulgarian split squat | 0.50 | limited | Speirs 2016 (barbell-loaded split squat) |
| Squat | DB lunge | 0.55 | heuristic | assumption |
| Squat | Goblet squat | 0.45 | heuristic | assumption |
| Deadlift | DB Romanian deadlift | 0.60 | heuristic | assumption |
| Deadlift | Single-leg DB Romanian deadlift | 0.35 | heuristic | assumption |

A ratio is the exercise's estimated max divided by the lift's, with the exercise counted as
the total load moved: both dumbbells for an exercise with one in each hand (catalogue grip
`per_hand`), the single dumbbell for a goblet squat (`both_hands`). Bodyweight is not
counted, which matters for the split squat and lunge; the ratio absorbs it at the loads
the lifter uses.

## Values

"Assumption" means no source gives the number.

| Key | Value | Basis |
|---|---|---|
| `STRENGTH_POOLING.transferWeight` | 0.4 | the projection model's `relatedSetTransfer` (training transfer, a different question); assumption for evidence |
| `STRENGTH_POOLING.evidenceHalfLifeDays` | 14 | assumption (a GZCLP lifter gains about 1–2% a week, as the forecast research simulated) |
| `STRENGTH_POOLING.sessionSdFraction` | 0.035 | assumption between Mitter 2022's lab scatter (about 2–2.6%) and Grgic 2020's tested-1RM median (4.2%) |
| `TRANSFER_RATIO.pairWindowDays` | 14 | assumption |
| `TRANSFER_RATIO.pairLogSd` | 0.06 | derived: √2 × 3.5% for two session estimates, plus about 2% real change inside a pair |
| `TRANSFER_RATIO.minPairsForOwnSpread` | 3 | assumption |
| prior spread, studied pairs | 0.08 (split squat 0.10) | assumption: people differ around a study's average; the split squat is wider because the study loaded a barbell |
| prior spread, assumed pairs | 0.20 | assumption: wide, so one or two of the lifter's own pairs win |
| `DROP_SETS.fatigueDiscount` | 0.25 | between the 22% and 34% our arithmetic gives for two protocols in Havers 2026 (see (d)) |
| `DROP_SETS.evidenceWeight` | 0.25 | assumption, small because the allowance is uncertain |
| `DROP_SETS.volumeCredit` | 0.5 | judgment, cautious against Fink 2018 (in Sødal 2023) |
| `DROP_SETS.maxExtraSetsPerWorkingSet` | 1 | judgment (spec decision 6) |
| `MUSCLE_WEIGHTS` | 1 / 0.5 | the app's existing volume weights (Pelland 2026 counts indirect sets as half) |
| `MUSCLE_INDEX.staleAfterDays` | 42 | assumption: about the length of a home or gym block |

## (a) Dumbbell against barbell bench press

**Saeterbakken et al. 2011**, *Journal of Sports Sciences*, PMID 21225489 (abstract; already
in the registry for `dumbbell-conversion`). Twelve healthy resistance-trained men (mean age
22.7), 1RM in Smith machine, barbell and dumbbell chest press, counterbalanced, 3–5 days
apart. Dumbbell 1RM was **17% below the barbell** (ES 1.11) and 14% below the Smith machine;
the barbell was 3% above the Smith machine. The abstract does not say whether the dumbbell
figure is both dumbbells together; a 17% gap only makes sense as the total.

**Jackson 2012**, a master's thesis at Arkansas State University (56 men aged 18–28; read on
the university's repository): subjects benched about 20% more with a barbell. It has no DOI
or PubMed id, so it cannot be registered (the registry tests require one); it is consistent
with Saeterbakken.

**What the app takes:** 0.83 for the dumbbell bench press, prior spread 0.08. No
peer-reviewed comparison of the floor press with the barbell bench was found; it starts at
the dumbbell bench's 0.83 as an assumption.

## (b) Dumbbell against barbell overhead press

**Saeterbakken & Fimland 2013**, *J Strength Cond Res*, doi 10.1519/JSC.0b013e318276b873,
PMID 23096062 (abstract). Fifteen healthy men; 1RM and muscle activity in seated and
standing barbell and dumbbell shoulder presses. Standing dumbbell 1RM was **about 7% lower
than standing barbell** (p = 0.002) and about 10% lower than seated dumbbell (p < 0.001).
The abstract does not give the seated barbell comparison or the men's training status,
or whether the dumbbell figure is both dumbbells together (a 7% gap only makes sense as
the total).

**What the app takes:** 0.93 for the DB shoulder press, which the catalogue lists apart
from the seated version, so it is read as standing. Combining the two figures would put a
seated dumbbell press about 3% above the standing barbell press (our arithmetic; the
paper does not compare them); not used, since the seated press is an accessory with no
T1 estimates. The Arnold press has no study; 0.8 assumes the rotation costs load.

## (c) Back squat against single-leg and dumbbell squats

**Speirs et al. 2016**, *J Strength Cond Res*, doi 10.1519/JSC.0000000000001096, PMID
26200193 (full text). Eighteen academy rugby players (18 years, about 97 kg, at least a
year of resistance training, three weeks of familiarisation) trained for five weeks with
either back squats or rear-foot-elevated split squats (rear foot on a 40 cm box, loaded
with a barbell, dominant leg tested). 1RM was extrapolated from a 3RM. Both groups improved
both lifts, with no group difference.
- Split squat 1RM (Table 4): 76 and 75 kg before, 83 and 81 kg after.
- Back squat 1RM (Figure 1, read off the bars): about 155 and 152 kg before, about 164 and
  159 kg after. Table 1's relative strength (1.60 and 1.57 × bodyweight of 96.7 and
  98.1 kg) gives 154.7 and 154.0 kg before, which agrees.
- Ratio (our arithmetic): **0.49 before, 0.50–0.51 after.**

No study comparing the goblet squat, the lunge or a dumbbell-loaded split squat with the
back squat in the same people was found.

**What the app takes:** 0.5 for the Bulgarian split squat with a wider prior (0.10): the
study loaded a barbell, not dumbbells, and extrapolated the 1RM. The lunge (0.55) and the
goblet squat (0.45, limited by holding the dumbbell at the chest) are assumptions.

**Flag for the other packages.** Today's home conversion (`DUMBBELL_LOAD_FACTOR`, 80% of the
barbell weight as total dumbbell load, from the bench press study) puts a Bulgarian split
squat at 0.8 of the squat. Speirs suggests about half. If the barbell and home lifts are
done at similar effort, the 80% conversion prescribes a split squat far heavier than the
squat it replaces. The learned ratio corrects this from the lifter's own pairs, but H3's
acceptance check ("with no home history the seed equals today's conversion") keeps the 80%
for a first home session; the lead may want to revisit that check for squat and deadlift
substitutes.

## (d) Deadlift against dumbbell Romanian deadlifts

**Lee et al. 2018** (*J Exerc Sci Fit*, PMID 30662500; full text) tested 21 trained men in
both lifts at 70% of their **Romanian deadlift** 1RM; the conventional deadlift 1RM was not
measured, so it gives no ratio. A rule of thumb on coaching sites puts the barbell Romanian
deadlift near 70% of the deadlift (not peer-reviewed and not verified; not cited). No study
of dumbbell Romanian deadlifts against the deadlift was found.

**What the app takes:** 0.6 (dumbbells lose a little more to grip) and 0.35 for the
single-leg version, both assumptions with a wide prior.

## (e) Drop sets

**Havers et al. 2026**, *Sports Medicine – Open*, doi 10.1186/s40798-026-01012-1, PMID
41920484 (full text). Twelve studies, 274 participants. In the moment, drop sets raised
effort ratings (SMD 1.62) and blood lactate (SMD 0.67) more than traditional sets; heart
rate was not clearly different. Over weeks, muscle size (SMD 0.04), strength (−0.04) and
muscular endurance did not differ. From the full text: maximal isometric force fell
11.6–18.1% after drop protocols against 6.3% after traditional sets (Goto); jump height fell
6.7% after drop sets only (Costa). Reported protocols include 10 reps at a 12-rep max then 5
reps after a cut to a 15-rep-max load (Costa), and 10 reps at 75% of 1RM then about 6 at
55% (Enes). The review's count of volume-equated studies is inconsistent between its text
and table.

**Sødal et al. 2023**, *Sports Medicine – Open*, doi 10.1186/s40798-023-00620-5, PMID 37523092
(full text). Six studies, 142 participants, five pooled. Muscle size grew with drop sets
(SMD 0.555) and traditional sets (0.437) with no significant difference; some drop-set
protocols took a half to a third of the time. (The abstract prints the between-group
interval as −0.199 to −0.509, which cannot contain its 0.155; a typo in the paper.)
Included: Fink 2018, 16 active men, one 12-rep-max set plus three 20% drops against three
sets of 12 to failure, six weeks: both grew, with no group difference.

**Mapping.**
- *Fatigue allowance.* By the app's formula, a fresh 15-rep-max load is 1.5× itself as an
  estimated max and 5 reps make it 1.17×, so Costa's drop sits **about 22% below fresh**;
  Enes's drop gives 0.55 × 1.2 = 0.66 of 1RM, **about 34% below**. These are our
  arithmetic, and the formula is weak at 15 reps. `fatigueDiscount` 0.25 sits between.
  Only the first drop after a set is used: each later drop is more tired by an amount no
  study reports. Because the allowance can be off by ten points either way, the first drops
  together count only `evidenceWeight` 0.25 of the session's best set, which bounds their
  effect on a session to a fifth of their gap from it.
- *Never an estimated max.* A drop never sets the session's estimated max (the value behind
  estimated-max rows and new bests), and a session with only drops gives no estimate.
- *Volume.* Half a set per drop, at most one extra set per working set. Fink's result
  (one set plus three drops grew muscle like three sets) would support more; half a set is
  the cautious reading, and it keeps a long chain of drops from inflating weekly volume.
- Grade `limited`: the direction (drops are done fatigued, and count for growth) is
  supported; every number is ours.

## (f) Pooling (heuristic)

No study measures how much a related exercise's estimated max tells about a lift's.
Design choices, all assumptions:
- **The latest barbell session starts the estimate**, superseding older ones, because that
  is what the app shows today. With barbell-only history the pooled value equals the
  latest stored estimated 1RM exactly (checked below).
- **Home sessions after it** count `transferWeight` 0.4 each, translated through the
  learned ratio. The 0.4 is the projection model's `relatedSetTransfer`, which was chosen
  for training transfer (Pelland 2026, Saeterbakken 2025); reusing it keeps the app's two
  transfer figures equal, not because it answers this question.
- **Age**: weights halve every 14 days back from the newest session, so one home session
  after a barbell session moves the estimate about a third of the way toward what it
  implies (weights 0.4 against about 0.9), and a run of four home sessions over two weeks
  moves it about two thirds of the way.
- **Range**: each session scatters by 3.5%, a home session by 3.5% ÷ √0.4, plus the ratio's
  own uncertainty, which every session of that exercise shares (so many home sessions with
  an unsure ratio stay unsure).
- **Ratios** are learned on a log scale with a normal prior: the prior counts as
  (0.06 ÷ prior spread)² pairs, which is 0.4–0.6 pairs for the studied ones and 0.1 for the
  assumed ones. Pairs are a home session and a gym session at most 14 days apart, matched
  closest first, each session used once.
- **Re-entry** (decision 3): the smaller of the steps rule and the heaviest weight at which
  the estimate says the stage's reps are possible (`estimate ÷ (1 + reps ÷ 30)`), rounded
  down to loadable plates. No reps are held in reserve: GZCLP keeps a lift until the last
  set fails, so the weight at which the stage's reps are the limit is the heaviest the
  program would still pass; a reserve would put a lifter who just passed below their own
  last weight with no change in strength.
- **Muscle trend**: each exercise against its own earlier sessions, averaged with primary
  muscles at 1 and secondary at 0.5. An exercise that starts later joins at the trend's
  current level, so starting the split squat mid-block reads as neither a jump nor a drop.

## Checks run

- **H4** (`src/lib/strength/pooled.test.ts`): a 12-week barbell-only GZCLP log with warm-ups,
  T2 days with RPE, a logged RPE on a T1 set, a failed 2-rep AMRAP, a 1-rep AMRAP (no
  estimate) and a 22-rep T3 AMRAP. After every one of its 24 workouts, the pooled estimate
  for each lift equals the latest row from the app's own `e1rmsForWorkout`.
- **H5** (`src/lib/strength/ratio.test.ts`): six synthetic pairs with a true ratio of 0.7,
  for every one of the nine priors, land at 0.687–0.717 (worst: the shoulder press from a
  0.93 prior), and again with ±2–4% noise per session; with no pairs the ratio is the prior
  and the pair count is 0.

## What stays unverified

- Every ratio in the people who use this app: the three studies are small (12, 15 and 18
  people), one used a barbell split squat, and none tested dumbbells against barbell at
  the rep ranges GZCLP uses.
- Whether a ratio between estimated maxes holds across rep ranges (bodyweight carried in
  a split squat or lunge makes it drift with load).
- How much a drop set understates fresh strength, measured as an estimated max, and how
  that grows with each drop.
- Any measure of how informative a related exercise is about a lift's strength (the
  pooling weight and half-life).
