// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import {
  DB_IMPORT_ALLOWLIST,
  PALETTE_ALLOWLIST,
  PALETTE_EXEMPT_PREFIXES,
} from "./architecture.allowlist";

const ROOT = path.resolve(__dirname, "..");
const SCANNED_DIRS = ["src/app", "src/components"];

const DB_IMPORT = /from\s+["']@\/db\/local["']/;
const PALETTE_CLASS =
  /\b(?:text|bg|border|ring|fill|stroke|from|to|via|outline|shadow|divide|decoration|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) {
      out.push(...sourceFiles(rel));
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(rel);
    }
  }
  return out;
}

function offenders(pattern: RegExp, exemptPrefixes: string[] = []): string[] {
  return SCANNED_DIRS.flatMap(sourceFiles)
    .filter((file) => !exemptPrefixes.some((prefix) => file.startsWith(prefix)))
    .filter((file) => pattern.test(readFileSync(path.join(ROOT, file), "utf8")))
    .sort();
}

function checkRule(found: string[], allowlist: string[]) {
  const allowed = new Set(allowlist);
  const foundSet = new Set(found);
  return {
    // Files that break the rule and are not on the allowlist: fix the file.
    newOffenders: found.filter((file) => !allowed.has(file)),
    // Allowlisted files that no longer break the rule: delete their allowlist line.
    staleEntries: allowlist.filter((file) => !foundSet.has(file)),
  };
}

describe("architecture", () => {
  it("pages and components read data through src/hooks and src/lib/data, not @/db/local", () => {
    const result = checkRule(offenders(DB_IMPORT), DB_IMPORT_ALLOWLIST);
    expect(result).toEqual({ newOffenders: [], staleEntries: [] });
  });

  it("pages and components use theme tokens, not raw Tailwind palette classes", () => {
    const result = checkRule(
      offenders(PALETTE_CLASS, PALETTE_EXEMPT_PREFIXES),
      PALETTE_ALLOWLIST
    );
    expect(result).toEqual({ newOffenders: [], staleEntries: [] });
  });
});
