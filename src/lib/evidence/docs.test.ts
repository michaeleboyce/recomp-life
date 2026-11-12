// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderEvidenceMarkdown } from "./markdown";
import { getAllRules, getAllSources } from "./index";

const DOC_PATH = path.resolve(__dirname, "../../../docs/coaching-rules.md");

describe("docs/coaching-rules.md", () => {
  it("is up to date with the registry (run `npm run docs:evidence` to regenerate)", () => {
    const generated = renderEvidenceMarkdown();

    if (process.env.UPDATE_EVIDENCE_DOCS === "1") {
      fs.mkdirSync(path.dirname(DOC_PATH), { recursive: true });
      fs.writeFileSync(DOC_PATH, generated);
    }

    const onDisk = fs.existsSync(DOC_PATH) ? fs.readFileSync(DOC_PATH, "utf8") : "";
    expect(onDisk).toBe(generated);
  });

  it("documents every rule and links every source", () => {
    const markdown = renderEvidenceMarkdown();
    for (const rule of getAllRules()) {
      expect(markdown, rule.id).toContain(`\`${rule.id}\``);
      expect(markdown, rule.id).toContain(rule.appBehavior);
    }
    for (const source of getAllSources()) {
      expect(markdown, source.id).toContain(`](${source.url})`);
    }
  });

  it("is marked as generated", () => {
    expect(renderEvidenceMarkdown().startsWith("<!-- GENERATED FILE.")).toBe(true);
  });
});
