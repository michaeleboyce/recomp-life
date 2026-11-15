// Stored coach events as log entries. These are the only stored part of the log: the
// changes that cannot be worked out from the rest of the data (a settings change that
// alters what the app does, an advisory accepted or dismissed). Pure.
import type { AdjustmentEntry, CoachEvent } from "@/types";
import { FEED_HREFS, isLive, realRuleId, ruleHref, toDate } from "./text";
import { SOURCE_RANK, type RankedEntry } from "./types";

/** `data.from` and `data.to`, when the event recorded both, as the entry's before and after. */
function changeOf(event: CoachEvent): AdjustmentEntry["change"] {
  const from = event.data?.from;
  const to = event.data?.to;
  if (from === null || from === undefined || to === null || to === undefined) return undefined;
  return { from: String(from), to: String(to) };
}

/**
 * One entry per live coach event, with the title and reason as they were stored. The
 * rule is kept only when it names a real one. A settings change links to settings; an
 * advisory links to its rule.
 */
export function coachEventEntries(events: CoachEvent[]): RankedEntry[] {
  const out: RankedEntry[] = [];
  for (const event of events) {
    const at = toDate(event.at);
    if (!at || !isLive(event)) continue;
    const ruleId = realRuleId(event.ruleId);
    const change = changeOf(event);
    const href =
      event.kind === "settingsChange" ? FEED_HREFS.settings : ruleId ? ruleHref(ruleId) : undefined;
    out.push({
      rank: SOURCE_RANK.coachEvent,
      entry: {
        id: `coachEvent:${event.id}`,
        at,
        source: "coachEvent",
        title: event.title,
        detail: event.detail,
        ...(change ? { change } : {}),
        ...(ruleId ? { ruleId } : {}),
        ...(href ? { href } : {}),
      },
    });
  }
  return out;
}
