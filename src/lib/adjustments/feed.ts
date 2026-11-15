// The adjustment log: every change the app made to the plan, to a forecast or to its
// own rules, and every override by the user, in one list with a plain reason. Almost
// all of it is derived on read from data the app already keeps; only coach events are
// stored. Pure: no React, no database, no clock.
// Spec: docs/plans/2026-11-14-glass-box-design.md ("Adjustment log", G9, G7, G10).
import { getChangelog, getRule } from "@/lib/evidence";
import type { AdjustmentEntry, EvidenceStrength } from "@/types";
import { coachEventEntries } from "./coachEvents";
import { forecastEntries } from "./forecasts";
import { liftAdjustmentEntries } from "./liftAdjustments";
import { overrideEntries } from "./overrides";
import { progressionEntries } from "./progression";
import { ruleChangeEntries } from "./ruleChanges";
import { compareIds, realRuleId } from "./text";
import type { AdjustmentFeedInput } from "./types";

/**
 * The merged log, newest first.
 *
 * Sources: what the program rules did after each workout (one entry for an ordinary
 * workout; a stage change, reset, hold and T3 increase each their own), changes made
 * to a lift outside a workout, changes to the app's rules, forecast revisions, the app
 * widening its own ranges, weight overrides by the user, and stored coach events.
 *
 * Every entry has a title that reads on its own, a reason of one or two sentences, a
 * rule id that names a real evidence rule wherever a rule applies (an override cites
 * none), and a link to where it can be seen or changed. `change` repeats the before
 * and after shown in the title, for a screen that sets them apart. `undo` is present
 * only on a change by hand or a time-off reduction that a second adjustment can still
 * cleanly take back.
 *
 * Ids come from the underlying rows, so the same history always gives the same ids
 * and adding history never renames an entry. Entries dated the same instant keep a
 * fixed order: a workout's own line, then its lifts in order, then its overrides. The
 * order of the input arrays does not matter, and the input is not changed.
 */
export function buildAdjustmentFeed(input: AdjustmentFeedInput): AdjustmentEntry[] {
  const ranked = [
    ...coachEventEntries(input.coachEvents),
    ...progressionEntries(input),
    ...overrideEntries(input),
    ...liftAdjustmentEntries(input),
    ...forecastEntries(input.forecasts),
    ...ruleChangeEntries(input.changelog ?? getChangelog()),
  ].filter(({ entry }) => Number.isFinite(entry.at.getTime()));

  ranked.sort(
    (a, b) =>
      b.entry.at.getTime() - a.entry.at.getTime() ||
      a.rank - b.rank ||
      compareIds(a.entry.id, b.entry.id)
  );

  // Two rows that would be the same entry (the same id) are shown once.
  const seen = new Set<string>();
  const feed: AdjustmentEntry[] = [];
  for (const { entry } of ranked) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    feed.push(entry);
  }
  return feed;
}

/** The evidence grade to show on an entry: the strength of its rule, or null without one. */
export function entryGrade(entry: Pick<AdjustmentEntry, "ruleId">): EvidenceStrength | null {
  const ruleId = realRuleId(entry.ruleId);
  return ruleId ? getRule(ruleId).strength : null;
}
