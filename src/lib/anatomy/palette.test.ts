import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  oklchToHex,
  HEAT_COLORS,
  RECOVERY_COLORS,
  painColor,
  painFill,
  FIGURE_COLORS,
  BODY_MAP_COLORS,
  ANATOMY_TOKENS,
  ANATOMY_DARK,
  ANATOMY_LIGHT,
  anatomyVar,
  anatomyHex,
  sceneColor,
  SCENE_PALETTES,
} from "./palette";

describe("oklchToHex", () => {
  it("converts achromatic colours", () => {
    expect(oklchToHex(0, 0, 0)).toBe("#000000");
    expect(oklchToHex(1, 0, 0)).toBe("#ffffff");
  });

  it("produces a 7-character hex string", () => {
    expect(oklchToHex(0.65, 0.1, 160)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("keeps a green hue green-dominant", () => {
    const hex = oklchToHex(0.65, 0.1, 160);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it("clamps out-of-gamut values instead of wrapping", () => {
    expect(oklchToHex(0.9, 0.4, 30)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

// ---- Colour maths for the contrast checks (WCAG 2 relative luminance). ----

function hexToLinear(hex: string): [number, number, number] {
  const ch = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return [ch(0), ch(1), ch(2)];
}
const luminance = (hex: string) => {
  const [r, g, b] = hexToLinear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const lightHex = (t: (typeof ANATOMY_TOKENS)[number]) => anatomyHex(t, "light");

// ---- globals.css ----

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

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

const rootTokens = tokens(":root");
const darkTokens = tokens(".dark");
const darkHex = (t: (typeof ANATOMY_TOKENS)[number]) => anatomyHex(t, "dark");
const HEAT = ["heat-1", "heat-2", "heat-3", "heat-4"] as const;

/** Hue of a hex colour in degrees (HSL hue; good enough to tell orange from red or green). */
function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Spread between the strongest and weakest sRGB channel (0-255): 0 for a grey. */
function chroma(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Math.max(...ch) - Math.min(...ch);
}

describe("anatomy tokens in globals.css", () => {
  it("defines every anatomy token in both themes", () => {
    for (const t of ANATOMY_TOKENS) {
      expect(rootTokens[`anatomy-${t}`], `:root --anatomy-${t}`).toBeDefined();
      expect(darkTokens[`anatomy-${t}`], `.dark --anatomy-${t}`).toBeDefined();
    }
  });

  it("dark values are the palette's dark colours", () => {
    for (const t of ANATOMY_TOKENS) {
      expect(darkTokens[`anatomy-${t}`], t).toBe(ANATOMY_DARK[t]);
    }
  });

  it("light values are the palette's light colours", () => {
    for (const t of ANATOMY_TOKENS) {
      expect(rootTokens[`anatomy-${t}`], t).toBe(ANATOMY_LIGHT[t]);
    }
  });

  it("the seam is the card colour in both themes", () => {
    expect(rootTokens["anatomy-seam"]).toBe(rootTokens["card"]);
    expect(darkTokens["anatomy-seam"]).toBe(darkTokens["card"]);
  });

  it("maps the body-map legend tokens for Tailwind", () => {
    for (const t of ["region", "region-stroke", "pain", "sore"]) {
      expect(css).toContain(`--color-anatomy-${t}: var(--anatomy-${t});`);
    }
  });
});

describe("load ramp is burnt orange in both themes", () => {
  it("every heat level is an orange hue, away from pain red and soreness mustard", () => {
    for (const theme of ["dark", "light"] as const) {
      for (const t of HEAT) {
        const h = hue(anatomyHex(t, theme));
        expect(h, `${theme} ${t}`).toBeGreaterThanOrEqual(12);
        expect(h, `${theme} ${t}`).toBeLessThanOrEqual(32);
      }
    }
  });

  it("the 3D scenes use the same ramp", () => {
    expect(SCENE_PALETTES.dark.anatomy.heat).toEqual(HEAT.map(darkHex));
    expect(SCENE_PALETTES.light.anatomy.heat).toEqual(HEAT.map(lightHex));
    expect(SCENE_PALETTES.dark.mannequin.trace).toBe(darkHex("heat-4"));
    expect(SCENE_PALETTES.light.mannequin.trace).toBe(lightHex("heat-4"));
  });
});

describe("dark theme contrast (against the dark card)", () => {
  const card = darkTokens["card"];

  it("resting muscle reads as a body on the card", () => {
    expect(contrast(darkHex("rest"), card)).toBeGreaterThanOrEqual(1.25);
    expect(contrast(darkHex("outline"), card)).toBeGreaterThanOrEqual(3);
  });

  it("heat ramp gets lighter level by level and the top level reaches 3:1", () => {
    let prev = darkHex("rest");
    for (const t of HEAT) {
      expect(luminance(darkHex(t)), t).toBeGreaterThan(luminance(prev));
      prev = darkHex(t);
    }
    for (const [a, b] of [["heat-1", "heat-2"], ["heat-2", "heat-3"], ["heat-3", "heat-4"]] as const) {
      expect(contrast(darkHex(a), darkHex(b)), `${a}/${b}`).toBeGreaterThanOrEqual(1.3);
    }
    expect(contrast(darkHex("heat-4"), card)).toBeGreaterThanOrEqual(3);
  });

  it("pain and soreness reach 3:1; recovery labels (text) reach 4.5:1", () => {
    expect(contrast(darkHex("pain"), card)).toBeGreaterThanOrEqual(3);
    expect(contrast(darkHex("sore"), card)).toBeGreaterThanOrEqual(3);
    for (const t of ["recovering", "ready", "primed", "detraining"] as const) {
      expect(contrast(darkHex(t), card), t).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("body-map joint rings stand off the card", () => {
    expect(contrast(darkHex("joint-ring"), card)).toBeGreaterThanOrEqual(3);
  });
});

describe("light theme contrast (against the light card)", () => {
  const card = rootTokens["card"];

  it("resting muscle reads as a body on the card", () => {
    expect(contrast(lightHex("rest"), card)).toBeGreaterThanOrEqual(1.25);
    expect(contrast(lightHex("outline"), card)).toBeGreaterThanOrEqual(3);
  });

  it("heat ramp darkens level by level and the top level reaches 3:1", () => {
    // Level 1 is a pale peach, told from the tan resting muscle by its stronger colour.
    expect(chroma(lightHex("heat-1"))).toBeGreaterThan(chroma(lightHex("rest")) * 1.3);
    let prev = lightHex("heat-1");
    for (const t of HEAT.slice(1)) {
      expect(luminance(lightHex(t)), t).toBeLessThan(luminance(prev));
      prev = lightHex(t);
    }
    for (const [a, b] of [["heat-1", "heat-2"], ["heat-2", "heat-3"], ["heat-3", "heat-4"]] as const) {
      expect(contrast(lightHex(a), lightHex(b)), `${a}/${b}`).toBeGreaterThanOrEqual(1.3);
    }
    expect(contrast(lightHex("heat-4"), card)).toBeGreaterThanOrEqual(3);
  });

  it("pain and soreness reach 3:1; recovery labels (text) reach 4.5:1", () => {
    expect(contrast(lightHex("pain"), card)).toBeGreaterThanOrEqual(3);
    expect(contrast(lightHex("sore"), card)).toBeGreaterThanOrEqual(3);
    for (const t of ["recovering", "ready", "primed", "detraining"] as const) {
      expect(contrast(lightHex(t), card), t).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("body-map regions and joint rings stand off the card", () => {
    expect(contrast(lightHex("region"), card)).toBeGreaterThanOrEqual(1.5);
    expect(contrast(lightHex("joint-ring"), card)).toBeGreaterThanOrEqual(3);
  });
});

describe("palette references", () => {
  it("figure colours are CSS variables", () => {
    expect(FIGURE_COLORS.muscle).toBe("var(--anatomy-rest)");
    expect(FIGURE_COLORS.seam).toBe("var(--anatomy-seam)");
    expect(anatomyVar("heat-2")).toBe("var(--anatomy-heat-2)");
  });

  it("level 0 is the resting muscle colour", () => {
    expect(HEAT_COLORS).toHaveLength(5);
    expect(HEAT_COLORS[0]).toBe(FIGURE_COLORS.muscle);
    expect(HEAT_COLORS[4]).toBe("var(--anatomy-heat-4)");
  });

  it("has a colour for each recovery status", () => {
    for (const s of ["recovering", "ready", "primed", "detraining"] as const) {
      expect(RECOVERY_COLORS[s]).toBe(`var(--anatomy-${s})`);
    }
  });

  it("pain is red, soreness amber, stronger with severity", () => {
    expect(painColor("pain", 5).fill).toBe("var(--anatomy-pain)");
    expect(painColor("soreness", 5).fill).toBe("var(--anatomy-sore)");
    expect(painColor("pain", 1).opacity).toBeLessThan(painColor("pain", 5).opacity);
  });

  it("painFill blends into the empty region by severity", () => {
    expect(painFill("pain", 5)).toEqual({
      fill: "var(--anatomy-pain)",
      stroke: "var(--anatomy-pain-stroke)",
    });
    expect(painFill("soreness", 1).fill).toBe(
      `color-mix(in srgb, var(--anatomy-sore) 25%, ${BODY_MAP_COLORS.region})`
    );
  });
});

describe("sceneColor", () => {
  it("resolves anatomy variables to the theme's hex", () => {
    expect(sceneColor(RECOVERY_COLORS.ready, "dark")).toBe(ANATOMY_DARK.ready);
    expect(sceneColor(RECOVERY_COLORS.ready, "light")).toBe(lightHex("ready"));
  });

  it("passes plain colours through", () => {
    expect(sceneColor("#123456", "light")).toBe("#123456");
  });

  it("light scene heat matches the light 2D ramp", () => {
    expect(SCENE_PALETTES.light.anatomy.heat).toEqual(
      (["heat-1", "heat-2", "heat-3", "heat-4"] as const).map(lightHex)
    );
  });
});
