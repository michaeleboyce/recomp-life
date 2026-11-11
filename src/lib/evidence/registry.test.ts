import { describe, it, expect } from "vitest";
import {
  SOURCES,
  EVIDENCE_RULES,
  EVIDENCE_CHANGELOG,
  AREA_ORDER,
  AREA_LABELS,
  STRENGTH_ORDER,
  STRENGTH_LABELS,
  STRENGTH_DESCRIPTIONS,
  DESIGN_LABELS,
  getRule,
  getAllRules,
  getAllSources,
  getSources,
  getRulesForSource,
  getRulesByArea,
  getChangelog,
  formatShortCitation,
  formatReference,
  formatRegistryDate,
  isRuleId,
  isSourceId,
} from "./index";
import { RULE_GROUPS } from "./rules";
import { evaluateRunImpact } from "@/lib/runRecovery";
import { getExerciseDecaySuggestions } from "@/lib/weightDecay";
import { evaluateT2AutoRegulation } from "@/lib/progression";
import { getRestEvidenceId } from "@/lib/restTimes";
import type { LiftState, RunLog, Tier } from "@/types";

const rules = getAllRules();
const sources = getAllSources();

describe("sources", () => {
  it("every source links to the paper over https", () => {
    for (const s of sources) {
      expect(s.url, s.id).toMatch(/^https:\/\/\S+$/);
      if (s.fullTextUrl) expect(s.fullTextUrl, s.id).toMatch(/^https:\/\/\S+$/);
    }
  });

  it("DOIs and PubMed ids are well formed when present", () => {
    for (const s of sources) {
      if (s.doi) expect(s.doi, s.id).toMatch(/^10\.\d{4,9}\/\S+$/);
      if (s.pmid) expect(s.pmid, s.id).toMatch(/^\d{6,9}$/);
    }
  });

  it("a DOI link in `url` matches the `doi` field", () => {
    for (const s of sources) {
      if (s.url.startsWith("https://doi.org/")) {
        expect(s.doi, s.id).toBe(s.url.replace("https://doi.org/", ""));
      }
    }
  });

  it("every source has the fields the UI shows", () => {
    for (const s of sources) {
      for (const field of ["short", "authors", "title", "journal", "population", "finding"] as const) {
        expect(s[field].trim().length, `${s.id}.${field}`).toBeGreaterThan(0);
      }
      expect(s.year, s.id).toBeGreaterThan(1980);
      expect(s.year, s.id).toBeLessThanOrEqual(new Date().getFullYear() + 1);
      expect(s.short, s.id).toContain(String(s.year));
      expect(DESIGN_LABELS[s.design], s.id).toBeTruthy();
    }
  });

  it("no source is orphaned: each is cited by at least one rule", () => {
    for (const s of sources) {
      expect(getRulesForSource(s.id).length, s.id).toBeGreaterThan(0);
    }
  });
});

describe("rules", () => {
  it("rule ids are unique across area files", () => {
    const total = RULE_GROUPS.reduce((n, group) => n + Object.keys(group).length, 0);
    expect(Object.keys(EVIDENCE_RULES)).toHaveLength(total);
  });

  it("rule ids are kebab-case", () => {
    for (const r of rules) expect(r.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("each rule file only holds rules for its own area", () => {
    for (const group of RULE_GROUPS) {
      const areas = new Set(Object.values(group).map((r) => r.area));
      expect(areas.size).toBe(1);
    }
  });

  it("every cited source exists", () => {
    for (const r of rules) {
      for (const sourceId of r.sources) expect(isSourceId(sourceId), `${r.id} -> ${sourceId}`).toBe(true);
    }
  });

  it("research-graded rules cite at least one source", () => {
    for (const r of rules) {
      if (r.strength === "strong" || r.strength === "moderate" || r.strength === "limited") {
        expect(r.sources.length, r.id).toBeGreaterThan(0);
      }
    }
  });

  it("heuristic rules cite nothing, so they are never dressed up as research", () => {
    for (const r of rules) {
      if (r.strength === "heuristic") expect(r.sources, r.id).toHaveLength(0);
    }
  });

  it("inline summaries fit on a phone: 80 characters or fewer", () => {
    for (const r of rules) {
      expect(r.summary.length, `${r.id}: "${r.summary}"`).toBeLessThanOrEqual(80);
    }
  });

  it("every rule explains what the app does and why", () => {
    for (const r of rules) {
      expect(r.title.trim().length, r.id).toBeGreaterThan(0);
      expect(r.appBehavior.trim().length, r.id).toBeGreaterThan(20);
      expect(r.rationale.trim().length, r.id).toBeGreaterThan(20);
      expect(r.appBehavior, r.id).not.toMatch(/undefined|NaN|\[object/);
      expect(r.title, r.id).not.toMatch(/undefined|NaN/);
      expect(r.reviewedOn, r.id).toMatch(/^\d{4}-\d{2}$/);
      expect(AREA_LABELS[r.area], r.id).toBeTruthy();
    }
  });

  it("active rules name where they are implemented and shown", () => {
    for (const r of rules.filter((x) => x.status === "active")) {
      expect(r.implementedIn.length, r.id).toBeGreaterThan(0);
      expect(r.surfaces.length, r.id).toBeGreaterThan(0);
    }
  });

  it("planned rules have no surfaces and say what must change first", () => {
    for (const r of rules.filter((x) => x.status === "planned")) {
      expect(r.surfaces, r.id).toHaveLength(0);
      expect(r.implementedIn.length, r.id).toBeGreaterThan(0);
      expect((r.activationNotes ?? "").trim().length, r.id).toBeGreaterThan(0);
    }
  });

  it("implementedIn entries use the path#symbol form", () => {
    for (const r of rules) {
      for (const loc of r.implementedIn) {
        expect(loc, r.id).toMatch(/^src\/[\w./-]+\.tsx?#\w+$/);
      }
    }
  });
});

describe("changelog", () => {
  it("every entry points at a real rule and real sources", () => {
    for (const entry of EVIDENCE_CHANGELOG) {
      expect(isRuleId(entry.ruleId), entry.ruleId).toBe(true);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.change.trim().length).toBeGreaterThan(10);
      for (const sourceId of entry.sources) expect(isSourceId(sourceId), sourceId).toBe(true);
    }
  });

  it("is returned newest first", () => {
    const dates = getChangelog().map((e) => e.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

describe("labels", () => {
  it("every area and strength has a label", () => {
    for (const area of AREA_ORDER) expect(AREA_LABELS[area]).toBeTruthy();
    for (const strength of STRENGTH_ORDER) {
      expect(STRENGTH_LABELS[strength]).toBeTruthy();
      expect(STRENGTH_DESCRIPTIONS[strength]).toBeTruthy();
    }
  });

  it("getRulesByArea covers every rule exactly once", () => {
    const grouped = getRulesByArea().flatMap((g) => g.rules.map((r) => r.id));
    expect(grouped.sort()).toEqual(rules.map((r) => r.id).sort());
  });

  it("getRulesByArea can filter by status", () => {
    const active = getRulesByArea("active").flatMap((g) => g.rules);
    expect(active.every((r) => r.status === "active")).toBe(true);
    expect(active.length).toBeGreaterThan(0);
  });
});

describe("formatting", () => {
  it("cites the first source with its study type", () => {
    expect(formatShortCitation("rest-light")).toBe("Singer 2024 · meta-analysis");
  });

  it("notes further sources", () => {
    expect(formatShortCitation("rest-heavy")).toBe("Grgic 2018 · systematic review +1");
  });

  it("is honest about heuristics and program rules", () => {
    expect(formatShortCitation("rest-cut-bonus")).toBe("Coaching heuristic · no direct research");
    expect(formatShortCitation("gzclp-progression")).toBe("GZCLP program rule");
  });

  it("formats a full reference", () => {
    expect(formatReference(SOURCES.singer2024)).toMatch(/^Singer et al\. \(2024\)\. Give it a rest/);
  });

  it("formats registry dates", () => {
    expect(formatRegistryDate("2026-11")).toBe("November 2026");
    expect(formatRegistryDate("2026-11-11")).toBe("11 November 2026");
  });

  it("getSources keeps the rule's own order", () => {
    expect(getSources("rest-heavy").map((s) => s.id)).toEqual(["grgic2018", "singer2024"]);
  });
});

describe("live values in rule text", () => {
  it("rest rules state the real rest times", () => {
    expect(getRule("rest-heavy").appBehavior).toContain("3:00");
    expect(getRule("rest-heavy").appBehavior).toContain("2:00");
    expect(getRule("rest-light").appBehavior).toContain("1:30");
  });

  it("the time-off rule states the real tiers", () => {
    const text = getRule("time-off").appBehavior;
    expect(text).toContain("up to 20 days");
    expect(text).toContain("5% after 21–41 days");
    expect(text).toContain("10% after 42–69 days");
    expect(text).toContain("15% after 70 days or more");
    expect(text).toContain("never exceeds 20%");
  });
});

describe("evidence ids returned by coaching logic", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);

  it("run advisories carry a valid rule id at both levels", () => {
    const run = (overrides: Partial<RunLog>): RunLog => ({
      id: "r", clientId: "r", date: hoursAgo(3), durationMinutes: 30, distanceMiles: 3,
      type: "outdoor", category: "tempo", notes: "", perceivedEffort: 4, synced: false,
      ...overrides,
    });
    const strong = evaluateRunImpact([run({})], true, now, { mode: "maintaining" });
    const standard = evaluateRunImpact([run({ date: hoursAgo(18), perceivedEffort: 3 })], true, now, { mode: "maintaining" });
    expect(strong.level).toBe("strong");
    expect(standard.level).toBe("advisory");
    for (const advisory of [strong, standard]) {
      expect(advisory.evidenceId && isRuleId(advisory.evidenceId)).toBe(true);
      expect(getRule(advisory.evidenceId!).status).toBe("active");
    }
  });

  it("decay suggestions carry a valid rule id", () => {
    const lift = {
      exerciseId: "squat", t1Weight: 200, t2Weight: 150, deloadActive: false,
      t1LastWorkoutDate: new Date(now.getTime() - 30 * 24 * 3600_000), t2LastWorkoutDate: null,
    } as unknown as LiftState;
    const [suggestion] = getExerciseDecaySuggestions(
      [{ exerciseId: "squat", tier: "T1" }], [lift], { mode: "maintaining" }, now
    );
    expect(isRuleId(suggestion.evidenceId)).toBe(true);
    expect(getRule(suggestion.evidenceId).status).toBe("active");
  });

  it("T2 load-drop suggestions carry a valid rule id", () => {
    const result = evaluateT2AutoRegulation(10, { mode: "maintaining" }, 150);
    expect(result.action).toBe("suggest_drop");
    expect(result.evidenceId && isRuleId(result.evidenceId)).toBe(true);
  });

  it("rest tiers map to active rules", () => {
    for (const tier of ["T1", "T2", "T3", "accessory"] as Tier[]) {
      const id = getRestEvidenceId(tier);
      expect(id && getRule(id).status).toBe("active");
    }
  });
});
