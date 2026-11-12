// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";

const KIT = __dirname;
const CSS = readFileSync(path.resolve(KIT, "../../app/globals.css"), "utf8");
const sources = readdirSync(KIT)
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => ({ file: f, text: readFileSync(path.join(KIT, f), "utf8") }));

const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:oklch|oklab|rgba?|hsla?)\(/;

function block(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  return CSS.slice(start, CSS.indexOf("\n}", start));
}

const TOKENS = [
  "line",
  "area",
  "grid",
  "axis",
  "point-ring",
  "inspect",
  "series-2",
  "series-3",
  "series-4",
  "band",
  "good",
  "warn",
];

describe("chart kit colours", () => {
  it("components contain no colour literals", () => {
    const offenders = sources.filter((s) => COLOUR_LITERAL.test(s.text)).map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it("every chart token is defined for light and dark and mapped into the theme", () => {
    for (const t of TOKENS) {
      expect(block(":root")).toContain(`--chart-${t}:`);
      expect(block(".dark")).toContain(`--chart-${t}:`);
      expect(block("@theme inline")).toContain(`--color-chart-${t}: var(--chart-${t});`);
    }
  });

  it("components only reference defined chart tokens", () => {
    const used = new Set(
      sources.flatMap((s) => [...s.text.matchAll(/var\(--chart-([a-z0-9-]+)\)/g)].map((m) => m[1]))
    );
    expect([...used].filter((t) => !TOKENS.includes(t))).toEqual([]);
  });
});
