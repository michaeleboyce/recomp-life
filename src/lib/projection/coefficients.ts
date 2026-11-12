// The numbers the e1RM projection model runs on. Owned by the `projection-research`
// package: the KEYS are a contract (src/lib/projection reads them); the VALUES are drawn
// from the research summarised in docs/research/2026-11-projection-model.md and graded in
// the evidence registry (src/lib/evidence/rules/projection.ts).
//
// The model scales the lifter's OWN measured rate of e1RM gain. These coefficients only
// say how much that rate should change under a different dose or phase, and how fast it
// fades. Every value is chosen to under-promise: where the research gives a direction but
// not a number, the number is at the cautious end and the rule is graded `limited`.
//
// Phase multipliers are relative to "bulking" = 1.

/**
 * Coefficients for `projectE1RM`.
 *
 * @evidence projection-dose-response
 * @evidence projection-rate-of-gain
 * @evidence projection-energy-deficit
 * @evidence projection-specificity
 */
export const PROJECTION_COEFFICIENTS = {
  /**
   * Diminishing returns on weekly hard sets for the lift's main muscle group:
   * rate multiplier = (scenario sets / baseline sets) ^ volumeExponent.
   *
   * Source: Pelland et al. (2026, Sports Medicine; numbers from the SportRxiv v2 full
   * text). Strength rose with weekly "fractional" sets (indirect sets count 0.5, as in
   * this app) along a reciprocal curve with a functional plateau: marginal slope 0.21%
   * strength gain per extra set at the dataset mean of 8.1 sets, and no detectable gain
   * beyond about 4-5 weekly sets. Converting that slope to an elasticity at the mean
   * (0.21 x 8.1 / ~17% gain) gives about 0.1, and the elasticity falls further at higher
   * volumes. Judgment: the conversion is ours, and a power law cannot reproduce the
   * plateau, so 0.1 is a mid-range approximation.
   * @evidence projection-dose-response
   */
  volumeExponent: 0.1,
  /**
   * Diminishing returns on sessions per week for the lift, at equal weekly sets:
   * rate multiplier = (scenario sessions / baseline sessions) ^ frequencyExponent.
   *
   * Source: Pelland et al. (2026) found strength rose with frequency after adjusting for
   * volume (reciprocal curve; +3.27% per extra session at the mean of ~2 a week; gains of
   * 12.7% at 1 and 17.3% at 2 sessions, implying an exponent of about 0.4). Grgic et al.
   * (2018) found no significant effect of frequency in volume-equated studies. Judgment:
   * we use half the Pelland figure because the two meta-analyses disagree and part of the
   * frequency effect is likely practice on an unfamiliar test lift.
   * @evidence projection-dose-response
   */
  frequencyExponent: 0.2,
  /**
   * How much one weekly set of ANOTHER exercise for the lift's primary muscles counts
   * toward the lift's 1RM progress, relative to a set of the lift itself (0..1). The model
   * feeds effective sets = direct sets + relatedSetTransfer x related sets to the volume
   * curve.
   *
   * Source: Pelland et al. (2026) counted sets of the tested exercise as 1 and sets of
   * other exercises training the same muscles as 0, 0.5 or 1; for weekly volume and
   * strength, 0.5 fitted very strongly better than 0 or 1 (only those three were tested).
   * Saeterbakken et al. (2025) found strength in an untrained test of the same muscles
   * rose with less than half the effect size of the trained task (0.42 vs 0.98), and
   * Mattocks et al. (2017) found practising the lift alone raised 1RM as much as
   * high-volume training. Judgment: 0.4, rounded down from those two figures.
   * @evidence projection-specificity
   */
  relatedSetTransfer: 0.4,
  /**
   * Bounds on the combined volume x frequency multiplier.
   *
   * Source: Pelland et al.'s reciprocal frequency curve rises by about a third from 1 to
   * 2 sessions and only a few percent beyond 3, and the volume curve is flat past ~5 sets,
   * so a dose change that multiplies the rate by more than ~1.3 is outside the evidence.
   * Going down, the same curves fall to roughly 0.7 at 1 session instead of 2 or 2 sets
   * instead of 10. Judgment: the exact bounds are ours.
   * @evidence projection-dose-response
   */
  minDoseMultiplier: 0.5,
  maxDoseMultiplier: 1.3,
  /**
   * Rate multiplier by training phase, relative to bulking.
   *
   * Source: Murphy & Koehler (2022) found strength gains in an energy deficit were not
   * significantly smaller than without one (effect size -0.31, p = 0.28, mostly untrained
   * people), while lean-mass gains were impaired. Helms et al. (2023) found no evidence
   * that a larger surplus (5% or 15% over maintenance) improved squat 1RM in trained
   * lifters, and body-mass gain did not predict 1RM gain. Judgment: the research supports
   * a small or no penalty; we keep a modest one for cutting (taken from the negative but
   * uncertain point estimate) and a token one for maintaining so the model never promises
   * more on a diet than off it.
   * @evidence projection-energy-deficit
   */
  phaseMultiplier: { bulking: 1, maintaining: 0.95, cutting: 0.8 },
  /**
   * Share of the previous week's rate that remains each week (gains slow over time).
   *
   * Source: Steele et al. (2023) fitted strength against time in 14,690 adults as a
   * linear-log curve that practically plateaued by 1-2 years. On that curve the rate after
   * t weeks of training falls as 1/t, so over the next w weeks it shrinks by t / (t + w):
   * equal to ~0.97 a week for someone 6 months in and ~0.98 at a year. Latella et al.
   * (2020) found the strongest powerlifters gained about half as fast as the least strong.
   * Judgment: 0.96 matches a lifter about 4 months in, so it under-promises for anyone
   * with longer training history.
   * @evidence projection-rate-of-gain
   */
  weeklyRateRetention: 0.96,
  /**
   * Weekly sets for a muscle group beyond which extra sets add nothing in the model
   * (and the screen warns about recovery instead).
   *
   * Source: in Pelland et al.'s strength dataset, weekly volume averaged 8.1 sets (SD 6.2),
   * so 20 is about the mean + 2 SD: beyond it the dose-response is extrapolation, and the
   * strength curve is already flat well before it. Judgment: the cut-off is ours.
   * @evidence projection-dose-response
   */
  weeklySetsCeiling: 20,
  /**
   * How fast the range widens: residual SD x (1 + bandGrowth x sqrt(weeks ahead)).
   *
   * Source: none sets this directly. The residual SD of the lifter's own e1RM fit already
   * holds day-to-day noise (a tested 1RM varies by a median 4.2% between sessions, Grgic
   * et al. 2020; reps-based estimates add more, Nuzzo et al. 2024). The growth term stands
   * for uncertainty in the future rate. Judgment: 0.5 widens the range to ~2.7x the
   * residual SD at 12 weeks.
   * @evidence projection-rate-of-gain
   */
  bandGrowth: 0.5,
  /**
   * Width of the range in residual standard deviations.
   *
   * Source: Grgic et al. (2020) and Nuzzo et al. (2024) show single 1RM measurements and
   * estimates carry several percent of noise; the dose-response models explain only about
   * a quarter of the variance between studies (Pelland et al.). Judgment: 1.28 SD (about
   * an 80% range) rather than 1 SD (68%), so the range does not look more certain than it is.
   * @evidence projection-rate-of-gain
   */
  bandWidthSd: 1.28,
} as const;

export type ProjectionCoefficients = typeof PROJECTION_COEFFICIENTS;
