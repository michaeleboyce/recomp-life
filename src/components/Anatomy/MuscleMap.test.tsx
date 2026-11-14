import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MuscleMap } from "./MuscleMap";
import { HEAT_COLORS, FIGURE_COLORS } from "@/lib/anatomy/palette";

function shapeFill(container: HTMLElement, view: "Front" | "Back", slug: string): string | null {
  const svg = container.querySelector(`svg[aria-label="${view} of body"]`);
  const path = svg?.querySelector<SVGPathElement>(`g[data-slug="${slug}"] path`);
  return path?.style.fill ?? null;
}

describe("MuscleMap (R4)", () => {
  it("renders front and back figures", () => {
    render(<MuscleMap />);
    expect(screen.getByRole("img", { name: "Front of body" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Back of body" })).toBeTruthy();
  });

  it("renders only the requested views", () => {
    render(<MuscleMap views={["front"]} />);
    expect(screen.queryByRole("img", { name: "Back of body" })).toBeNull();
  });

  it("colours shapes by heat level", () => {
    const { container } = render(<MuscleMap heat={{ chest: 4, triceps: 2 }} />);
    expect(shapeFill(container, "Front", "chest")).toBe(HEAT_COLORS[4]);
    expect(shapeFill(container, "Back", "triceps")).toBe(HEAT_COLORS[2]);
    expect(shapeFill(container, "Front", "quadriceps")).toBe(FIGURE_COLORS.muscle);
  });

  it("draws a muscle only in the views it is visible from", () => {
    const { container } = render(<MuscleMap heat={{ glutes: 4 }} />);
    expect(shapeFill(container, "Back", "gluteal")).toBe(HEAT_COLORS[4]);
    // Nothing on the front should be lit.
    const front = container.querySelector('svg[aria-label="Front of body"]')!;
    const lit = [...front.querySelectorAll("path")].filter(
      (p) => (p as SVGPathElement).style.fill === HEAT_COLORS[4]
    );
    expect(lit).toHaveLength(0);
  });

  it("explicit colours take precedence over heat", () => {
    const { container } = render(
      <MuscleMap heat={{ chest: 4 }} colors={{ chest: "#123456" }} />
    );
    expect(shapeFill(container, "Front", "chest")).toBe("#123456");
  });

  it("is not interactive without a press handler", () => {
    render(<MuscleMap heat={{ chest: 4 }} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("fires onMusclePress with the muscle for a tapped shape", () => {
    const onPress = vi.fn();
    render(<MuscleMap onMusclePress={onPress} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Chest" })[0]);
    expect(onPress).toHaveBeenCalledWith("chest");
    fireEvent.click(screen.getAllByRole("button", { name: "Lats" })[0]);
    expect(onPress).toHaveBeenLastCalledWith("lats");
  });

  it("supports keyboard activation", () => {
    const onPress = vi.fn();
    render(<MuscleMap onMusclePress={onPress} />);
    fireEvent.keyDown(screen.getAllByRole("button", { name: "Quads" })[0], { key: "Enter" });
    expect(onPress).toHaveBeenCalledWith("quads");
  });

  it("does not make non-muscle shapes tappable", () => {
    render(<MuscleMap onMusclePress={() => {}} />);
    const names = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(names).not.toContain("head");
    expect(names.every((n) => n && n.length > 0)).toBe(true);
  });

  it("outlines the selected muscle", () => {
    const { container } = render(<MuscleMap selected="chest" />);
    const path = container.querySelector<SVGPathElement>(
      'svg[aria-label="Front of body"] g[data-slug="chest"] path'
    );
    expect(path?.style.stroke).toBe(FIGURE_COLORS.selectedStroke);
  });

  it("draws with theme variables, so the figure follows light and dark", () => {
    const { container } = render(<MuscleMap heat={{ chest: 3 }} />);
    expect(shapeFill(container, "Front", "chest")).toBe("var(--anatomy-heat-3)");
    expect(shapeFill(container, "Front", "quadriceps")).toBe("var(--anatomy-rest)");
    expect(shapeFill(container, "Front", "head")).toBe("var(--anatomy-inert)");
    const paths = [...container.querySelectorAll<SVGPathElement>("svg path")];
    for (const p of paths) {
      expect(p.getAttribute("fill")).toBeNull();
      expect(p.style.stroke).toMatch(/^var\(--anatomy-/);
    }
  });
});
