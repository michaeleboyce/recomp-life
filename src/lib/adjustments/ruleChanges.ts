// Changes to the app's own rules as log entries, from the evidence changelog. Pure.
import { getRule, getSource, isSourceId } from "@/lib/evidence";
import type { EvidenceChange } from "@/types";
import { joinList, realRuleId, ruleHref } from "./text";
import { SOURCE_RANK, type RankedEntry } from "./types";

/**
 * A changelog day ("2026-11-11") as a moment: midday UTC, so it shows as that calendar
 * day in every time zone from UTC-11 to UTC+11. A changelog row has no time of day.
 */
function dayToDate(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return Number.isFinite(date.getTime()) ? date : null;
}

/** A short, repeatable fingerprint of a sentence (FNV-1a, base 36). */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * One entry per changelog row, citing the rule that changed and linking to it. The
 * detail is the changelog's own sentence followed by the research it names. A row has
 * no id of its own, so the entry's id is its day, its rule and a fingerprint of its
 * sentence: the same on every call wherever the row sits in the list.
 */
export function ruleChangeEntries(changelog: ReadonlyArray<EvidenceChange>): RankedEntry[] {
  const out: RankedEntry[] = [];
  for (const row of changelog) {
    const at = dayToDate(row.date);
    if (!at) continue;
    const ruleId = realRuleId(row.ruleId);
    const cited = row.sources.filter(isSourceId).map((id) => getSource(id).short);
    out.push({
      rank: SOURCE_RANK.ruleChange,
      entry: {
        id: `ruleChange:${row.date}:${row.ruleId}:${fingerprint(row.change)}`,
        at,
        source: "ruleChange",
        title: ruleId ? `Rule updated: ${getRule(ruleId).title}` : "Rule updated",
        detail: `${row.change}${cited.length > 0 ? ` Research: ${joinList(cited)}.` : ""}`,
        ...(ruleId ? { ruleId, href: ruleHref(ruleId) } : {}),
      },
    });
  }
  return out;
}
