# Open items: what the docs promised that the code does not have

Status: audit of 2026-11-17. Every plan document, the rules marked `planned`, `CLAUDE.md`,
`docs/architecture.md` and code comments were read and each item checked against the code.
Items being built that day (accessory screens, the estimated-max chart) and items fixed that
day (F6, the Strength tab rows) are left out. Nothing here is scheduled until Michael picks it.

## Promised and missing

| Item | Where it was promised | In the code today | Size |
|---|---|---|---|
| Lighter weeks (deload) never start | rule `deload` (planned); `CLAUDE.md` "data-driven deload triggers" | `generateDeloadPrescription` in `src/lib/deload.ts` is called by nothing but the glossary; the fatigue sign only prompts | L |
| Pain entries do not change weights | rule `pain-load-changes` (planned) | `generateModifications` in `src/lib/painModifications.ts` is called by nothing; Body check only shows the red-flag warning | M |
| Readiness answers change nothing but one suggestion | rule `readiness`, its caveat | Sleep and stress shift forecasts and can suggest skipping accessories; they do not change loads or recovery | M |
| Apple Health in coaching | Apple Health plan, out of scope there | Heart-rate variability and resting heart rate are shown, not used in readiness; no background delivery | L |
| Session volume warning | rule `volume-ratio` (planned) | `calculateSessionVolumeRatio` exists; its own comment says its thresholds flag nearly every cutting session; no screen shows it | M |
| Weigh-in reminder | Settings "Weigh-in reminder" and its time | Only feeds the "weigh-in due" card on Today; no notification is scheduled | M |
| Minimum length for the sync passphrase | security review | `src/lib/syncKey.ts` has no length check (waiting for the owner to set a long passphrase first) | S |
| Dashboards the user builds | UI refresh U7; glass-box option F | The metrics layer exists; no stored tile list or builder | L |
| Two-column layout from 768 px | UI refresh U15 | Almost no screen uses it; the glass-box plan lists tablet layout as out of scope | M |
| Android | `CLAUDE.md` (now corrected) | iOS only; no Android project | L |

## Partly built

- First home weights: own history, then learned ratio, then starting ratio (done, F6). The
  accessory first-weight helper (`ownHistoryFirstWeight`) and the home seed are two functions
  with the same idea; unify them.
- The lift page's "Show all" renders every session.
- Still app-only (imported history not counted): the weekly review, insights, the Strength
  tab's recovery rows.
- `docs/architecture.md`, "Cleanup still to do": logic that imports from components
  (`lib/review`, `favoriteSummary`, an evidence rule, `GlanceTiles` constants), remaining
  local copies of text and date helpers, about eight lift-naming functions with different
  wording, `forecastText.ts` (860 lines of logic in a component folder), three naming schemes
  for test builders, six lint warnings, logic still inside hooks.
- R3 (one owner for each piece of active-workout state): deferred on purpose.
- `QuickAddSheet` still plans a whole workout to read which day is next; a home exercise no
  longer offered is seeded from app sets only in the rebuild but from app plus imported sets
  on resume.

## Decide: build or remove

Code that exists, is tested, and nothing uses. Each should be either switched on behind a
rule the owner accepts, or deleted, not left in between.

- `deload` and `pain-load-changes`: the evidence is graded limited and two plans chose to
  leave them off.
- `volume-ratio`: needs new thresholds before it could be shown.
- The "lighter week worth considering" forecast: the research note argues against it.
- The weigh-in reminder: schedule a notification, or rename the setting to what it does.
- The unused `Logo` component.

## Corrected in the docs on 2026-11-17

- `CLAUDE.md` said sign-in was Auth.js with Apple and Google, and that the app ran on Android.
  There is no sign-in (one shared sync passphrase) and no Android project.
- `README.md` was the unedited create-next-app text.
- Settings showed a hard-coded "Version 0.1.0"; it now reads the real version, as More does.

## Owner actions still open

- A long sync passphrase on every device and in Vercel; then the minimum length is enforced.
- Two-factor sign-in on GitHub, Vercel and Neon; rotate the Neon password; scope the Vercel
  environment variables to Production.
- Settings → Import history: confirm or edit the starting-weight suggestions.
- If the installed iPhone app is used: rebuild and reinstall it (the sync protocol changed).
- All SQL scripts in `scripts/sql/` are applied to the live database as of 2026-11-17.
