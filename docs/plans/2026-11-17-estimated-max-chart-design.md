# The estimated-max chart: a clear trend, what feeds it, any window

Status: built and deployed on 2026-11-17 (M1 to M10), from Michael's request ("shouldn't
estimated max also have a smooth trend line that is clear to see and show how and when it
includes other exercises? you should also be able to adjust the time period window" and "I
thought there are estimated max for all of the muscles"). Pure functions in
`src/lib/strength/timeline.ts`; the chart is used by the lift headline, the projection
history, the Strength tab total, each muscle's sheet and the home exercise pages. Checked on
the live data. Follow-ups are in `docs/plans/2026-11-17-open-items.md`.

## Today

- The chart on a lift's page (`src/components/Lift/LiftHeadline.tsx`) joins the lift's own
  session estimates point to point and lays a dashed straight line across them
  (`trendOverlay`, a linear fit). There is no smoothed trend.
- Only the lift's own sessions are drawn. Sessions of related exercises (a dumbbell bench for
  the bench) feed the strength estimate the planner uses (`pooledLiftEstimate`,
  rule `strength-pooling`) but appear nowhere on the chart, so the chart and the planner can
  disagree with no explanation. The page lists the ratios in text only.
- The headline number is the latest own point, not the estimate the planner uses.
- The window is one of four fixed tabs (4w, 3m, 1y, All).

## Decisions

1. **One bold smooth line is the chart.** It is the app's estimate as of each day: the
   recency-weighted mean of every session estimate up to that day, with the strength
   library's own weights (the lift's sessions at 1, a related exercise's at
   `STRENGTH_POOLING.transferWeight` after dividing by its ratio, each halving per
   half-life), drawn with a soft band of one standard deviation. Session estimates are dots
   behind it, never joined point to point.
2. **Every dot says what it is.** Filled: this lift. Another colour and shape: each related
   exercise, already translated into this lift's pounds. Hollow: imported. A ring: a weight
   set by hand and not lifted yet. A legend names each with its ratio ("DB bench press ÷ 0.89,
   from 20 pairs" or "starting ratio") and switches it on or off; switching a source off
   redraws the line without it.
3. **A strip under the chart shows when other exercises carry the estimate:** for each week,
   the share of the estimate's weight from the lift itself, from each related exercise and
   from imported sessions.
4. **Tapping a dot explains it:** the set, its estimated max, the ratio and the translated
   value, and how much it counts today (transfer weight times age).
5. **The headline is the planner's estimate** (`pooledLiftEstimate`), marked on the chart at
   today, with the trend's change over the window beside it. Where the smooth line and the
   planner's number differ (the planner starts from the latest session of the lift itself),
   a line of text says why.
6. **Any window.** Presets 4w, 3m, 6m, 1y, 2y, All; drag or pinch on the chart to zoom to
   any span, with a reset; the vertical scale fits the window. A smoothing control (light,
   standard, heavy) sets the half-life used for the line only, never for planning. The
   choice of window and smoothing is remembered on the device.
7. **Display only.** No planned weight, forecast or stored value changes.

## Requirements

| ID | Requirement | Acceptance check |
|---|---|---|
| M1 | `strengthTimeline(liftId, sets, options)`: pure; every session estimate of the lift and its related exercises with source, ratio (learned with pair count, or starting), translated value and today's weight | Unit tests with made-up sets incl. imported, a hand-set target, a drop set, a related exercise with and without learned pairs |
| M2 | `smoothedEstimate(timeline, { halfLifeDays, sources })`: the line and band on an even grid of days; with only the lift's own sessions and one session it equals that session; at today, with every source on and the standard half-life, the difference from `pooledLiftEstimate` is explained by a returned reason | Unit tests; a property test that the line stays inside the range of the dots it averages |
| M3 | Share-of-weight series per week by source | Shares sum to 1; a week with no session carries the last shares |
| M4 | Chart component: bold line, band, dots by source, legend with toggles, today marker, contribution strip; tokens only; an accessible summary and a table view of the points | Renders with demo data, imported-only data and no data; no colour literals |
| M5 | Point detail on tap | Component test for each source kind |
| M6 | Window: six presets, zoom by drag and pinch, reset, fitted vertical scale; smoothing control; remembered on the device, safe when storage is unavailable | Scripted at 390 wide and at desktop width |
| M7 | Used on the lift and exercise pages (barbell and home versions) and the projection page; the Strength tab's total uses the same smooth line | The same lift shows the same line on every screen |
| M8 | Rule `strength-pooling` cited on the chart; its text says the line's smoothing is a display choice; changelog entry | Evidence contract tests |
| M10 | Every muscle gets the same chart. Progress → Muscles → Strength already has a strength trend per muscle (`muscleStrengthIndex`: an index, 100 at the muscle's first estimate, pooled from every exercise that works it), shown as a number and a small sparkline. Tapping a muscle opens the full chart for it: the smooth line of the index, a dot per contributing session coloured by exercise, the legend with each exercise's weight (primary or secondary) and toggles, the strip of which exercises carry it when, and the same window and smoothing controls. It stays an index, with a line saying why (a muscle has no one-rep max; exercises with different loads are compared with their own past). The Muscles tab row says "strength trend", not "estimated max" | Component tests with made-up sets for a muscle worked by a barbell lift, a home exercise that joins later and an imported exercise; the row's number equals the chart's latest value |
| M9 | Fast with about 12,000 sets; memoised; reduced motion honoured; static-export safe | Timing test on made-up data; both builds |

## Notes

- New code goes in new files (`src/lib/strength/timeline.ts`, a new chart component in
  `src/components/chart-kit/`); `LiftHeadline` keeps its props, so the exercise page that
  embeds it needs no change.
- The straight-line projection (`fitTrend`, the projection page's forecast) is unchanged; the
  smooth line describes the past, the projection the future.
