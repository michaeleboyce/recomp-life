// @vitest-environment node
/**
 * Contract between the evidence registry and the rest of the codebase.
 *
 * These tests read the source tree. They fail when a rule, its code and its
 * UI drift apart, and their messages say what to fix. See
 * docs/research/ADDING_RESEARCH.md.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getAllRules, getRule, isRuleId } from "./index";

const ROOT = path.resolve(__dirname, "../../..");
const SRC = path.join(ROOT, "src");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");
const read = (relPath: string) => fs.readFileSync(path.join(ROOT, relPath), "utf8");
const exists = (relPath: string) => fs.existsSync(path.join(ROOT, relPath));

/** App source files, excluding tests and the registry itself. */
const sourceFiles = walk(SRC)
  .map(rel)
  .filter((file) => !/\.test\.tsx?$/.test(file))
  .filter((file) => !file.startsWith("src/lib/evidence/"));

const TAG = /@evidence\s+([a-z0-9]+(?:-[a-z0-9]+)*)/g;
const LITERAL_RULE_ID = /ruleId="([^"]+)"/g;

const tagsByFile = new Map<string, string[]>();
const literalIdsByFile = new Map<string, string[]>();
for (const file of sourceFiles) {
  const content = read(file);
  const tags = [...content.matchAll(TAG)].map((m) => m[1]);
  if (tags.length > 0) tagsByFile.set(file, tags);
  const literals = [...content.matchAll(LITERAL_RULE_ID)].map((m) => m[1]);
  if (literals.length > 0) literalIdsByFile.set(file, literals);
}

const rules = getAllRules();

describe("scanner", () => {
  it("actually finds tags and citation lines (guards against a broken scan)", () => {
    const implementedFiles = new Set(
      rules.flatMap((r) => r.implementedIn.map((loc) => loc.split("#")[0]))
    );
    expect(tagsByFile.size).toBeGreaterThanOrEqual(implementedFiles.size);
    expect(literalIdsByFile.size).toBeGreaterThanOrEqual(10);
  });
});

describe("@evidence tags in code", () => {
  it("every tag names a rule in the registry", () => {
    for (const [file, tags] of tagsByFile) {
      for (const tag of tags) {
        expect(isRuleId(tag), `${file}: @evidence ${tag} is not a rule id`).toBe(true);
      }
    }
  });

  it("every tagged file is listed in that rule's implementedIn", () => {
    for (const [file, tags] of tagsByFile) {
      for (const tag of tags) {
        if (!isRuleId(tag)) continue;
        const listed = getRule(tag).implementedIn.some((loc) => loc.split("#")[0] === file);
        expect(listed, `${file} is tagged @evidence ${tag} but the rule's implementedIn does not list it`).toBe(true);
      }
    }
  });
});

describe("implementedIn", () => {
  it("every location exists, defines the symbol and carries the rule's tag", () => {
    for (const rule of rules) {
      for (const location of rule.implementedIn) {
        const [file, symbol] = location.split("#");
        expect(exists(file), `${rule.id}: ${file} does not exist`).toBe(true);
        const content = read(file);
        expect(
          new RegExp(`\\b${symbol}\\b`).test(content),
          `${rule.id}: ${file} does not define ${symbol}`
        ).toBe(true);
        expect(
          (tagsByFile.get(file) ?? []).includes(rule.id),
          `${rule.id}: add "@evidence ${rule.id}" to the doc comment in ${file}`
        ).toBe(true);
      }
    }
  });
});

describe("surfaces", () => {
  it("every surface of an active rule exists and renders an EvidenceLine for it", () => {
    for (const rule of rules.filter((r) => r.status === "active")) {
      for (const surface of rule.surfaces) {
        expect(exists(surface), `${rule.id}: ${surface} does not exist`).toBe(true);
        const content = read(surface);
        expect(content.includes("EvidenceLine"), `${rule.id}: ${surface} does not render an EvidenceLine`).toBe(true);
        const literal = content.includes(`ruleId="${rule.id}"`);
        const dynamic = /ruleId=\{/.test(content);
        expect(
          literal || dynamic,
          `${rule.id}: ${surface} has no <EvidenceLine ruleId="${rule.id}" />`
        ).toBe(true);
      }
    }
  });

  it("every EvidenceLine with a literal rule id is listed in that rule's surfaces", () => {
    for (const [file, ids] of literalIdsByFile) {
      for (const id of ids) {
        expect(isRuleId(id), `${file}: ruleId="${id}" is not a rule id`).toBe(true);
        if (!isRuleId(id)) continue;
        const rule = getRule(id);
        expect(
          rule.surfaces.includes(file),
          `${file} shows "${id}" but the rule's surfaces does not list it`
        ).toBe(true);
      }
    }
  });

  it("planned rules are not shown anywhere", () => {
    for (const rule of rules.filter((r) => r.status === "planned")) {
      for (const [file, ids] of literalIdsByFile) {
        expect(ids.includes(rule.id), `${file} shows planned rule "${rule.id}"; set its status to active first`).toBe(false);
      }
    }
  });
});

describe("legacy references", () => {
  it("no code comment points at the old spec document", () => {
    for (const file of sourceFiles) {
      expect(/spec (section|sections|§)\s*\d/i.test(read(file)), `${file} cites a spec section; use an @evidence tag instead`).toBe(false);
    }
  });
});
