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

  it("keeps the accent hue green-dominant", () => {
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
const fmt = ([l, c, h]: readonly [number, number, number]) => `oklch(${l} ${c} ${h})`;

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
      expect(rootTokens[`anatomy-${t}`], t).toBe(fmt(ANATOMY_LIGHT[t]));
    }
  });

  it("light seam is the card colour", () => {
    expect(rootTokens["anatomy-seam"]).toBe(rootTokens["card"]);
  });

  it("maps the body-map legend tokens for Tailwind", () => {
    for (const t of ["region", "region-stroke", "pain", "sore"]) {
      expect(css).toContain(`--color-anatomy-${t}: var(--anatomy-${t});`);
    }
  });
});

describe("dark theme is unchanged", () => {
  // The colours the figure, heat ramp, recovery map and body map used before the
  // light theme existed. Dark mode must keep drawing exactly these.
  const BEFORE: Record<string, string> = {
    outline: oklchToHex(0.45, 0.01, 260),
    rest: oklchToHex(0.31, 0.008, 260),
    inert: oklchToHex(0.25, 0.006, 260),
    hair: oklchToHex(0.21, 0.006, 260),
    seam: oklchToHex(0.18, 0.005, 260),
    selected: "#3b82f6",
    "selected-stroke": "#93c5fd",
    "heat-1": oklchToHex(0.38, 0.05, 160),
    "heat-2": oklchToHex(0.5, 0.09, 160),
    "heat-3": oklchToHex(0.65, 0.13, 160),
    "heat-4": oklchToHex(0.85, 0.17, 160),
    recovering: oklchToHex(0.65, 0.18, 55),
    ready: oklchToHex(0.7, 0.16, 85),
    primed: oklchToHex(0.65, 0.17, 155),
    detraining: oklchToHex(0.45, 0.02, 260),
    pain: "#ef4444",
    "pain-stroke": "#dc2626",
    sore: "#f59e0b",
    "sore-stroke": "#d97706",
    region: "#374151",
    "region-stroke": "#4b5563",
    "joint-ring": "#9ca3af",
  };

  it("pins every dark token to its previous colour", () => {
    expect(Object.keys(ANATOMY_DARK).sort()).toEqual(Object.keys(BEFORE).sort());
    for (const [t, hex] of Object.entries(BEFORE)) {
      expect(ANATOMY_DARK[t as keyof typeof ANATOMY_DARK], t).toBe(hex);
      expect(darkTokens[`anatomy-${t}`], t).toBe(hex);
    }
  });

  it("keeps the 3D scenes' dark colours", () => {
    const a = SCENE_PALETTES.dark.anatomy;
    expect(a.rest).toBe("#6b7080");
    expect(a.other).toBe("#565a66");
    expect(a.heat).toEqual([1, 2, 3, 4].map((i) => BEFORE[`heat-${i}`]));
    expect(a.heatEmissive).toEqual([0, 0, 0.12, 0.28]);
    expect(a.bone).toBe(oklchToHex(0.82, 0.02, 85));
    expect(a.selected).toBe("#3b82f6");
    expect(SCENE_PALETTES.dark.mannequin).toEqual({
      body: "#cfd4de",
      joint: "#aeb4c0",
      steel: "#8d929c",
      plate: "#737986",
      pad: "#5d6370",
      floor: "#23262e",
      trace: BEFORE["heat-4"],
    });
  });
});

describe("light theme contrast (against the light card)", () => {
  const card = oklchToHex(0.995, 0.002, 250);

  it("resting muscle reads as a body on the card", () => {
    expect(contrast(lightHex("rest"), card)).toBeGreaterThanOrEqual(1.5);
  });

  it("heat ramp darkens level by level and the top level reaches 3:1", () => {
    let prev = lightHex("rest");
    for (const t of ["heat-1", "heat-2", "heat-3", "heat-4"] as const) {
      expect(luminance(lightHex(t)), t).toBeLessThan(luminance(prev));
      prev = lightHex(t);
    }
    for (const [a, b] of [["heat-1", "heat-2"], ["heat-2", "heat-3"], ["heat-3", "heat-4"]] as const) {
      expect(contrast(lightHex(a), lightHex(b)), `${a}/${b}`).toBeGreaterThanOrEqual(1.3);
    }
    expect(contrast(lightHex("heat-4"), card)).toBeGreaterThanOrEqual(3);
  });

  it("heat ramp is one sage hue", () => {
    for (const t of ["heat-1", "heat-2", "heat-3", "heat-4"] as const) {
      expect(ANATOMY_LIGHT[t][2]).toBe(160);
    }
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
