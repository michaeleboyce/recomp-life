// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { oklchToHex } from "@/lib/anatomy/palette";
import { THEME_COLORS } from "@/components/ThemeProvider";

/**
 * Theme checks on globals.css: text stays readable (WCAG AA, 4.5:1) on the surfaces
 * it sits on in both themes, the shared tokens exist, and the browser chrome colour
 * matches the page.
 */

const root = process.cwd();
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("\n}", start));
}

function tokens(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block(selector).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const light = tokens(":root");
// Dark inherits anything it does not override from :root.
const dark = { ...light, ...tokens(".dark") };
const THEMES = { light, dark } as const;

/** A solid colour token as sRGB hex: hex, or oklch(L C H) without alpha. */
function solid(theme: Record<string, string>, name: string): string {
  const value = theme[name];
  expect(value, `--${name}`).toBeDefined();
  const v = value.match(/^var\(--([a-z0-9-]+)\)$/);
  if (v) return solid(theme, v[1]);
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const o = value.match(/^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/);
  if (o) return oklchToHex(Number(o[1]), Number(o[2]), Number(o[3]));
  throw new Error(`--${name} is not a solid colour: ${value}`);
}

function luminance(hex: string): number {
  const ch = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(Object.entries(THEMES))("%s theme text contrast", (_name, theme) => {
  const check = (text: string, surface: string) =>
    expect(
      contrast(solid(theme, text), solid(theme, surface)),
      `--${text} on --${surface}`
    ).toBeGreaterThanOrEqual(4.5);

  it("body text on the page, cards, popovers and raised surfaces", () => {
    check("foreground", "background");
    check("card-foreground", "card");
    check("popover-foreground", "popover");
    check("foreground", "card-raised");
    check("secondary-foreground", "secondary");
    check("accent-foreground", "accent");
  });

  it("muted text on the page, cards and muted fills", () => {
    for (const surface of ["background", "card", "muted"]) check("muted-foreground", surface);
  });

  it("primary-button text on the primary colour", () => {
    check("primary-foreground", "primary");
    check("sidebar-primary-foreground", "sidebar-primary");
  });

  it("accent, status and tier text on the page and on cards", () => {
    const textTokens = [
      "accent-primary",
      "destructive",
      "success",
      "warning",
      "info",
      "tier-t1",
      "tier-t2",
      "tier-t3",
      "tier-accessory",
      "tier-warmup",
      "grade-strong",
      "grade-moderate",
      "grade-limited",
      "grade-heuristic",
    ];
    for (const t of textTokens) for (const s of ["background", "card"]) check(t, s);
  });

  it("chart lines reach 3:1 on the page and stay distinct from each other", () => {
    const lines = ["chart-line", "chart-good", "chart-warn"].map((t) => solid(theme, t));
    for (const c of lines) expect(contrast(c, solid(theme, "background"))).toBeGreaterThanOrEqual(3);
    expect(new Set(lines).size).toBe(3);
    const overlays = ["chart-line", "chart-series-2", "chart-series-3", "chart-series-4"];
    expect(new Set(overlays.map((t) => solid(theme, t))).size).toBe(4);
  });
});

describe("shared tokens", () => {
  const NEW_COLOURS = [
    "grade-strong",
    "grade-moderate",
    "grade-limited",
    "grade-heuristic",
    "grade-program",
    "photo-tint",
    "stripe-1",
    "stripe-2",
    "stripe-3",
  ];

  it("defines the glass-box colour tokens in both themes, mapped for Tailwind", () => {
    const own = { light: tokens(":root"), dark: tokens(".dark") };
    for (const t of NEW_COLOURS) {
      expect(own.light[t], `:root --${t}`).toBeDefined();
      expect(own.dark[t], `.dark --${t}`).toBeDefined();
      expect(block("@theme inline")).toContain(`--color-${t}: var(--${t});`);
    }
  });

  it("maps the three font families, including the display face", () => {
    for (const f of ["sans", "mono", "display"]) {
      expect(block("@theme inline")).toContain(`--font-${f}: var(--font-${f});`);
    }
  });
});

describe("browser chrome colour", () => {
  it("each theme's colour is that theme's page background", () => {
    expect(THEME_COLORS.dark).toBe(solid(dark, "background"));
    expect(THEME_COLORS.light).toBe(solid(light, "background"));
  });

  it("the manifest and the layout use the dark (first paint) colour", () => {
    const manifest = JSON.parse(readFileSync(join(root, "public/manifest.json"), "utf8"));
    expect(manifest.theme_color).toBe(THEME_COLORS.dark);
    expect(manifest.background_color).toBe(THEME_COLORS.dark);
    const layout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
    expect(layout).toContain(`themeColor: "${THEME_COLORS.dark}"`);
  });
});
