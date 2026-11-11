/**
 * Renders the evidence registry as Markdown for docs/coaching-rules.md.
 *
 * The file is generated: change the registry, then run `npm run docs:evidence`.
 * docs.test.ts fails when the file on disk is out of date.
 */

import {
  AREA_LABELS,
  DESIGN_LABELS,
  REGISTRY_REVIEWED_ON,
  STRENGTH_DESCRIPTIONS,
  STRENGTH_LABELS,
  STRENGTH_ORDER,
  formatRegistryDate,
  getAllRules,
  getAllSources,
  getChangelog,
  getRule,
  getRulesByArea,
  getRulesForSource,
  getSource,
  getSources,
  type RuleWithId,
  type SourceWithId,
} from "./index";

function sourceLine(source: SourceWithId): string {
  const fullText = source.fullTextUrl
    ? ` [Free full text](${source.fullTextUrl}).`
    : "";
  return `- [${source.authors} (${source.year}). ${source.title}. *${source.journal}*.](${source.url}) ${capitalise(DESIGN_LABELS[source.design])}; ${source.population}. ${source.finding}${fullText}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function codeLocation(location: string): string {
  const [file, symbol] = location.split("#");
  return symbol ? `\`${file}\` (\`${symbol}\`)` : `\`${file}\``;
}

function ruleSection(rule: RuleWithId): string {
  const sources = getSources(rule.id);
  const lines: string[] = [];

  lines.push(`### ${rule.title}`);
  lines.push("");
  lines.push(`- **Rule id:** \`${rule.id}\``);
  lines.push(
    `- **Status:** ${rule.status === "active" ? "Active" : "Planned (in the code, not connected to any screen)"}`
  );
  lines.push(`- **Evidence:** ${STRENGTH_LABELS[rule.strength]}`);
  lines.push(
    `- **Implemented in:** ${rule.implementedIn.map(codeLocation).join(", ")}`
  );
  if (rule.surfaces.length > 0) {
    lines.push(
      `- **Shown in:** ${rule.surfaces.map((s) => `\`${s}\``).join(", ")}`
    );
  }
  lines.push(`- **Reviewed:** ${formatRegistryDate(rule.reviewedOn)}`);
  lines.push("");
  lines.push(`**In one line.** ${rule.summary}`);
  lines.push("");
  lines.push(`**What the app does.** ${rule.appBehavior}`);
  lines.push("");
  lines.push(`**Why.** ${rule.rationale}`);
  if (rule.caveat) {
    lines.push("");
    lines.push(`**Limits.** ${rule.caveat}`);
  }
  if (rule.activationNotes) {
    lines.push("");
    lines.push(`**Before this is switched on.** ${rule.activationNotes}`);
  }
  lines.push("");
  if (sources.length === 0) {
    lines.push(
      rule.strength === "program"
        ? "**Sources.** None: this comes from the GZCLP program design."
        : "**Sources.** None: this is a coaching convention with no direct research."
    );
  } else {
    lines.push("**Sources**");
    lines.push("");
    for (const source of sources) lines.push(sourceLine(source));
  }
  lines.push("");
  return lines.join("\n");
}

/** The full Markdown reference: rules by area, bibliography and changelog. */
export function renderEvidenceMarkdown(): string {
  const rules = getAllRules();
  const active = rules.filter((r) => r.status === "active");
  const planned = rules.filter((r) => r.status === "planned");
  const sources = getAllSources().sort((a, b) => a.short.localeCompare(b.short));
  const out: string[] = [];

  out.push(
    "<!-- GENERATED FILE. Do not edit by hand. Source: src/lib/evidence. Regenerate with `npm run docs:evidence`. -->"
  );
  out.push("");
  out.push("# Coaching rules and research");
  out.push("");
  out.push(
    "Every coaching rule in ReComp Life: what the app does, why, how strong the research is, where the rule lives in the code and where it is shown. The same content appears in the app under Tools > How the App Coaches."
  );
  out.push("");
  out.push(
    `${active.length} active rules, ${planned.length} planned rules, ${sources.length} sources. Last reviewed against the research: ${formatRegistryDate(REGISTRY_REVIEWED_ON)}.`
  );
  out.push("");
  out.push(
    "To add or change research, follow [research/ADDING_RESEARCH.md](research/ADDING_RESEARCH.md)."
  );
  out.push("");

  out.push("## How to read the evidence grades");
  out.push("");
  out.push("| Grade | Meaning |");
  out.push("|---|---|");
  for (const strength of STRENGTH_ORDER) {
    out.push(`| ${STRENGTH_LABELS[strength]} | ${STRENGTH_DESCRIPTIONS[strength]} |`);
  }
  out.push("");
  out.push(
    "Most training studies last 8 to 12 weeks and many use people new to lifting, so even well-supported rules are averages. Every suggestion in the app can be overridden. This is training guidance, not medical advice."
  );
  out.push("");

  out.push("## Summary");
  out.push("");
  out.push("| Rule | Area | Status | Evidence | Sources |");
  out.push("|---|---|---|---|---|");
  for (const rule of rules) {
    const cited = getSources(rule.id)
      .map((s) => s.short)
      .join(", ");
    out.push(
      `| \`${rule.id}\` | ${AREA_LABELS[rule.area]} | ${rule.status === "active" ? "Active" : "Planned"} | ${STRENGTH_LABELS[rule.strength]} | ${cited || "none"} |`
    );
  }
  out.push("");

  for (const group of getRulesByArea()) {
    out.push(`## ${group.label}`);
    out.push("");
    for (const rule of group.rules) out.push(ruleSection(rule));
  }

  out.push("## Bibliography");
  out.push("");
  for (const source of sources) {
    const usedBy = getRulesForSource(source.id)
      .map((r) => `\`${r.id}\``)
      .join(", ");
    out.push(`${sourceLine(source)} Used by: ${usedBy}.`);
  }
  out.push("");

  out.push("## Changelog");
  out.push("");
  out.push("Changes made to the app because of research, newest first.");
  out.push("");
  for (const entry of getChangelog()) {
    const cited = entry.sources.map((id) => getSource(id).short).join(", ");
    out.push(
      `- **${formatRegistryDate(entry.date)}** — \`${entry.ruleId}\` (${getRule(entry.ruleId).title}): ${entry.change} Sources: ${cited}.`
    );
  }
  out.push("");

  return out.join("\n");
}
