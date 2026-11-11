# Adding research to the app

The evidence registry in `src/lib/evidence/` is the single source of truth for every coaching rule: what the app does, why, how strong the research is, the linked sources, where the rule is implemented and where it is shown.

Three things are generated from it and must never be edited by hand:

- the inline citations and detail sheets in the app (`src/components/Evidence/`)
- the in-app page at `/research` ("How the App Coaches")
- [`docs/coaching-rules.md`](../coaching-rules.md)

## How the pieces connect

| Piece | Where | Purpose |
|---|---|---|
| Sources | `src/lib/evidence/sources.ts` | One entry per paper, with its link and a one-sentence finding |
| Rules | `src/lib/evidence/rules/<area>.ts` | One entry per coaching rule; cites sources by key |
| Changelog | `src/lib/evidence/changelog.ts` | Dated record of research-driven behaviour changes |
| Code tag | `@evidence <rule-id>` in a doc comment | Marks the code that implements a rule |
| UI | `<EvidenceLine ruleId="<rule-id>" />` | Shows the reason, citation and detail sheet |

A rule is either `active` (shown in the UI) or `planned` (the logic exists in `src/lib` but is not connected to a screen). Planned rules are documented and listed in the app under "Not active yet", but have no citation lines.

## Add a source

1. Add an entry to `SOURCES` in `src/lib/evidence/sources.ts`. The key is first author plus year, for example `singer2024`.
2. `url` is required. Prefer the DOI link (`https://doi.org/...`) and set `doi` to match. Add `pmid` and `fullTextUrl` (free full text) when they exist.
3. Write `finding` as one plain sentence stating only what the paper reports. Anything the app adds beyond that belongs in the rule's `caveat`.
4. Cite it from at least one rule. A source no rule uses fails the tests.
5. Run `npm run check:links` and open the link yourself to confirm it is the right paper.

## Add or change a rule

1. Edit the file for the rule's area in `src/lib/evidence/rules/`. For a new area, add a file, add it to `RULE_GROUPS` and `EVIDENCE_RULES` in `rules/index.ts`, and add the area to `EvidenceArea` in `src/types/index.ts` and to `AREA_ORDER` / `AREA_LABELS` in `src/lib/evidence/index.ts`.
2. Fill in every field:
   - `summary`: the inline line, 80 characters or fewer.
   - `appBehavior`: what the app does. Build it from the exported constants of the lib module (rest seconds, thresholds, percentages) so the text cannot drift from the code.
   - `rationale`, `caveat`: plain language. Put the limits of the evidence in `caveat`.
   - `strength`: grade honestly (see below).
   - `implementedIn`: `"path#symbol"` for each place the rule lives.
   - `surfaces`: the component files that show it. Empty for planned rules.
3. Tag the implementing code: add `@evidence <rule-id>` to the doc comment of each file listed in `implementedIn`.
4. Show it: add `<EvidenceLine ruleId="<rule-id>" />` under the suggestion (or `variant="icon"` in a tight header) in each file listed in `surfaces`. Pass `hideLibraryLink` on screens used during an active workout.
5. If the app's behaviour changes: write or update the failing test first, change the lib constant or logic, then add an entry to `EVIDENCE_CHANGELOG`.

### Grading strength

| Grade | Use when |
|---|---|
| `strong` | A position stand or several agreeing meta-analyses address the rule directly |
| `moderate` | One meta-analysis or several trials support it, or strong evidence is applied indirectly |
| `limited` | Small or beginner-only studies, or the direction is supported but the exact number is a judgment call |
| `heuristic` | No direct research; a coaching convention. Must cite no sources |
| `program` | Defined by GZCLP itself |

Do not cite a paper for a claim it does not make. When research points one way and the rule needs a specific number the research does not give, grade it `limited` and say so in `caveat`.

## Connect a planned rule

1. Make the changes listed in its `activationNotes` (test first).
2. Wire the logic into the UI and add the `EvidenceLine`.
3. Set `status` to `"active"`, fill in `surfaces`, remove `activationNotes`, and add a changelog entry.

## Before committing

```bash
npm run docs:evidence   # regenerates docs/coaching-rules.md
npm run check:links     # needs the network; run when sources change
npx vitest run          # includes the contract tests
```

The contract tests in `src/lib/evidence/` fail with a message saying what to fix when:

- a rule cites a missing source, or a source is cited by nothing
- a research-graded rule has no source, or a heuristic cites one
- a summary is longer than 80 characters
- an `@evidence` tag names an unknown rule, or a rule's `implementedIn` file lacks the tag or the symbol
- a `surfaces` file does not render the rule's `EvidenceLine`, or an `EvidenceLine` appears in a file the rule does not list
- a planned rule is shown in the UI
- `docs/coaching-rules.md` is out of date
