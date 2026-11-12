/**
 * Evidence registry: the single source of truth for every coaching rule.
 *
 * Each rule records what the app does, why, how strong the research is, the
 * linked sources, where the rule is implemented and where it is shown. The
 * in-app citations, the research page and docs/coaching-rules.md are all
 * generated from this data.
 *
 * To add research, follow docs/research/ADDING_RESEARCH.md.
 */

import type {
  EvidenceArea,
  EvidenceChange,
  EvidenceRule,
  EvidenceSource,
  EvidenceStrength,
  StudyDesign,
} from "@/types";
import { SOURCES, type SourceId } from "./sources";
import { EVIDENCE_RULES, type RuleId } from "./rules";
import { EVIDENCE_CHANGELOG } from "./changelog";

export { SOURCES, EVIDENCE_RULES, EVIDENCE_CHANGELOG };
export type { SourceId, RuleId };

export type RuleWithId = EvidenceRule<SourceId> & { id: RuleId };
export type SourceWithId = EvidenceSource & { id: SourceId };

/** Month the registry as a whole was last reviewed against the literature. */
export const REGISTRY_REVIEWED_ON = "2026-11";

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** Areas in display order. */
export const AREA_ORDER: readonly EvidenceArea[] = [
  "progression",
  "effort",
  "rest",
  "recovery",
  "running",
  "volume",
  "nutrition",
  "projection",
  "pain",
  "equipment",
];

export const AREA_LABELS: Record<EvidenceArea, string> = {
  progression: "Program and progression",
  effort: "Effort and estimates",
  rest: "Rest between sets",
  recovery: "Recovery and time off",
  running: "Running",
  volume: "Training volume",
  nutrition: "Fat loss",
  projection: "Strength projections",
  pain: "Pain",
  equipment: "Equipment",
};

export const STRENGTH_LABELS: Record<EvidenceStrength, string> = {
  strong: "Strong evidence",
  moderate: "Moderate evidence",
  limited: "Limited evidence",
  heuristic: "Coaching heuristic",
  program: "Program rule",
};

export const STRENGTH_DESCRIPTIONS: Record<EvidenceStrength, string> = {
  strong:
    "A position stand or several agreeing meta-analyses address this rule directly.",
  moderate:
    "One meta-analysis or several trials support it, or strong evidence is applied indirectly.",
  limited:
    "Small or beginner-only studies, or the direction is supported but the exact number is a judgment call.",
  heuristic: "No direct research. A common coaching convention.",
  program: "Defined by the GZCLP program, not by research.",
};

/** Strengths in order from best supported to least, for filters and legends. */
export const STRENGTH_ORDER: readonly EvidenceStrength[] = [
  "strong",
  "moderate",
  "limited",
  "heuristic",
  "program",
];

export const DESIGN_LABELS: Record<StudyDesign, string> = {
  "position-stand": "position stand",
  "meta-analysis": "meta-analysis",
  "systematic-review": "systematic review",
  review: "review",
  rct: "randomised trial",
  trial: "trial",
  observational: "observational study",
};

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

const RULE_IDS = Object.keys(EVIDENCE_RULES) as RuleId[];
const SOURCE_IDS = Object.keys(SOURCES) as SourceId[];

export function isRuleId(value: string): value is RuleId {
  return Object.prototype.hasOwnProperty.call(EVIDENCE_RULES, value);
}

export function isSourceId(value: string): value is SourceId {
  return Object.prototype.hasOwnProperty.call(SOURCES, value);
}

export function getRule(id: RuleId): RuleWithId {
  return { id, ...(EVIDENCE_RULES[id] as EvidenceRule<SourceId>) };
}

export function getAllRules(): RuleWithId[] {
  return RULE_IDS.map(getRule);
}

export function getSource(id: SourceId): SourceWithId {
  return { id, ...(SOURCES[id] as EvidenceSource) };
}

export function getAllSources(): SourceWithId[] {
  return SOURCE_IDS.map(getSource);
}

/** Sources cited by a rule, in the order the rule lists them. */
export function getSources(ruleId: RuleId): SourceWithId[] {
  return getRule(ruleId).sources.map(getSource);
}

/** Rules that cite a source. */
export function getRulesForSource(sourceId: SourceId): RuleWithId[] {
  return getAllRules().filter((rule) => rule.sources.includes(sourceId));
}

/** Rules grouped by area in display order; areas with no rules are omitted. */
export function getRulesByArea(
  status?: EvidenceRule["status"]
): Array<{ area: EvidenceArea; label: string; rules: RuleWithId[] }> {
  const rules = getAllRules().filter((r) => !status || r.status === status);
  return AREA_ORDER.map((area) => ({
    area,
    label: AREA_LABELS[area],
    rules: rules.filter((r) => r.area === area),
  })).filter((group) => group.rules.length > 0);
}

/** Changelog entries, newest first. */
export function getChangelog(): ReadonlyArray<EvidenceChange<RuleId, SourceId>> {
  return [...EVIDENCE_CHANGELOG].sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Short inline citation for a rule.
 *
 *   "Singer 2024 · meta-analysis"
 *   "Grgic 2018 · systematic review +1"   (one further source)
 *   "Coaching heuristic · no direct research"
 *   "GZCLP program rule"
 */
export function formatShortCitation(ruleId: RuleId): string {
  const rule = getRule(ruleId);
  const sources = getSources(ruleId);

  if (rule.strength === "program") return "GZCLP program rule";
  if (rule.strength === "heuristic" || sources.length === 0) {
    return "Coaching heuristic · no direct research";
  }

  const first = sources[0];
  const more = sources.length > 1 ? ` +${sources.length - 1}` : "";
  return `${first.short} · ${DESIGN_LABELS[first.design]}${more}`;
}

/** Full one-line reference for a source, e.g. for bibliographies. */
export function formatReference(source: EvidenceSource): string {
  return `${source.authors} (${source.year}). ${source.title}. ${source.journal}.`;
}

/** "2026-11" -> "November 2026"; "2026-11-11" -> "11 November 2026". */
export function formatRegistryDate(value: string): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const [year, month, day] = value.split("-");
  const monthName = months[Number(month) - 1] ?? month;
  return day ? `${Number(day)} ${monthName} ${year}` : `${monthName} ${year}`;
}
