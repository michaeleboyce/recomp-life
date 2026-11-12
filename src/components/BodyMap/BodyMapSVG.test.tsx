import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BodyMapSVG from "./BodyMapSVG";
import { ALL_BODY_REGIONS } from "@/lib/anatomy/regionMapping";
import { formatRegion } from "@/lib/painModifications";
import type { BodyRegion, PainSorenessEntry } from "@/types";

function entry(overrides: Partial<PainSorenessEntry>): PainSorenessEntry {
  return {
    id: "e1",
    clientId: "c1",
    date: new Date("2026-02-10T10:00:00"),
    region: "left_knee",
    sensation: "pain",
    severity: 3,
    synced: false,
    ...overrides,
  };
}

function setup(props: Partial<React.ComponentProps<typeof BodyMapSVG>> = {}) {
  const onRegionTap = vi.fn();
  const utils = render(
    <BodyMapSVG activeEntries={[]} selectedRegion={null} onRegionTap={onRegionTap} {...props} />
  );
  return { onRegionTap, ...utils };
}

function view(container: HTMLElement, name: "Front" | "Back"): Element {
  return container.querySelector(`svg[aria-label="${name} of body"]`)!;
}

describe("BodyMapSVG (R5)", () => {
  it("makes all 19 body regions tappable", () => {
    const { container, onRegionTap } = setup();
    for (const region of ALL_BODY_REGIONS) {
      // Attribute selector rather than getAllByRole: role queries walk the
      // whole SVG each time and made this loop slow enough to time out.
      const buttons = container.querySelectorAll(
        `[role="button"][aria-label="${formatRegion(region)} region"]`
      );
      expect(buttons.length, region).toBeGreaterThan(0);
      fireEvent.click(buttons[0]);
      expect(onRegionTap, region).toHaveBeenLastCalledWith(region);
    }
    expect(onRegionTap).toHaveBeenCalledTimes(19);
  });

  it("emits anatomical sides from muscle areas", () => {
    const { container, onRegionTap } = setup();
    fireEvent.click(view(container, "Front").querySelector('g[data-slug="quadriceps"][data-side="left"]')!);
    expect(onRegionTap).toHaveBeenLastCalledWith("left_quad");
    fireEvent.click(view(container, "Back").querySelector('g[data-slug="hamstring"][data-side="right"]')!);
    expect(onRegionTap).toHaveBeenLastCalledWith("right_hamstring");
    fireEvent.click(view(container, "Back").querySelector('g[data-slug="lower-back"][data-side="left"]')!);
    expect(onRegionTap).toHaveBeenLastCalledWith("lower_back");
  });

  it("emits joint regions from the joint dots", () => {
    const { container, onRegionTap } = setup();
    const cases: [string, "left" | "right", "Front" | "Back", BodyRegion][] = [
      ["elbow", "left", "Front", "left_elbow"],
      ["elbow", "right", "Back", "right_elbow"],
      ["wrist", "right", "Front", "right_wrist"],
      ["hip", "left", "Front", "left_hip"],
    ];
    for (const [joint, side, viewName, region] of cases) {
      const dot = view(container, viewName).querySelector(
        `g[data-joint="${joint}"][data-side="${side}"]`
      );
      expect(dot, `${viewName} ${joint} ${side}`).not.toBeNull();
      fireEvent.click(dot!);
      expect(onRegionTap).toHaveBeenLastCalledWith(region);
    }
  });

  it("does not make arms and calves tappable (no pain region exists for them)", () => {
    const { container } = setup();
    const biceps = view(container, "Front").querySelector('g[data-slug="biceps"]');
    expect(biceps?.getAttribute("role")).toBeNull();
  });

  it("supports keyboard activation", () => {
    const { onRegionTap } = setup();
    fireEvent.keyDown(screen.getAllByRole("button", { name: "Chest region" })[0], { key: " " });
    expect(onRegionTap).toHaveBeenCalledWith("chest");
  });

  it("colours pain red-ish and soreness amber-ish, selected blue", () => {
    const { container } = setup({
      activeEntries: [
        entry({ id: "a", region: "left_knee", sensation: "pain", severity: 5 }),
        entry({ id: "b", region: "right_knee", sensation: "soreness", severity: 5 }),
      ],
      selectedRegion: "chest",
    });
    const fill = (slug: string, side: string) =>
      view(container, "Front")
        .querySelector(`g[data-slug="${slug}"][data-side="${side}"] path`)
        ?.getAttribute("fill");
    expect(fill("knees", "left")).toBe("#ef4444");
    expect(fill("knees", "right")).toBe("#f59e0b");
    expect(fill("chest", "left")).toBe("#3b82f6");
    expect(fill("quadriceps", "left")).toBe("#374151");
  });

  it("colours left and right independently", () => {
    const { container } = setup({
      activeEntries: [entry({ region: "left_shoulder", sensation: "pain", severity: 5 })],
    });
    const front = view(container, "Front");
    expect(
      front.querySelector('g[data-slug="deltoids"][data-side="left"] path')?.getAttribute("fill")
    ).toBe("#ef4444");
    expect(
      front.querySelector('g[data-slug="deltoids"][data-side="right"] path')?.getAttribute("fill")
    ).toBe("#374151");
  });

  it("uses the most recent entry for a region", () => {
    const { container } = setup({
      activeEntries: [
        entry({ id: "old", sensation: "pain", severity: 5, date: new Date("2026-02-01") }),
        entry({ id: "new", sensation: "soreness", severity: 5, date: new Date("2026-02-09") }),
      ],
    });
    expect(
      view(container, "Front")
        .querySelector('g[data-slug="knees"][data-side="left"] path')
        ?.getAttribute("fill")
    ).toBe("#f59e0b");
  });

  it("colours a joint dot when its region has an entry", () => {
    const { container } = setup({
      activeEntries: [entry({ region: "left_elbow", sensation: "pain", severity: 5 })],
    });
    const dot = view(container, "Front").querySelector(
      'g[data-joint="elbow"][data-side="left"] circle:last-child'
    );
    expect(dot?.getAttribute("fill")).toBe("#ef4444");
  });
});
