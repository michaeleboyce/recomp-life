import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { FIGURE_COLORS } from "@/lib/anatomy/palette";
import { FILL_TRANSITION, SessionMuscleFigure, resetSessionFigureMemory } from "./SessionMuscleFigure";

function shapeFill(container: HTMLElement, view: "Front" | "Back", slug: string): string | null {
  const svg = container.querySelector(`svg[aria-label="${view} of body"]`);
  const path = svg?.querySelector<SVGPathElement>(`g[data-slug="${slug}"] path`);
  return path?.style.fill ?? null;
}

const nextFrame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

beforeEach(() => resetSessionFigureMemory());
afterEach(cleanup);

describe("SessionMuscleFigure", () => {
  it("eases each muscle's colour to its new level, and not under reduced motion", () => {
    render(<SessionMuscleFigure exercises={[{ exerciseId: "squat", completedSets: 1 }]} />);
    const map = screen.getByRole("group", { name: "Muscles worked so far" });
    for (const c of FILL_TRANSITION.split(" ")) expect(map).toHaveClass(c);
    expect(FILL_TRANSITION).toContain("[&_path]:duration-400");
    expect(FILL_TRANSITION).toContain("[&_path]:ease-out");
    expect(FILL_TRANSITION).toContain("motion-reduce:[&_path]:transition-none");
  });

  it("opened again, starts from what it showed and fills in the sets logged since", async () => {
    const before = [
      { exerciseId: "squat", completedSets: 5 },
      { exerciseId: "bench", completedSets: 0 },
    ];
    const first = render(<SessionMuscleFigure exercises={before} />);
    await nextFrame();
    // Squat worked; bench (chest) not yet.
    expect(shapeFill(first.container, "Front", "chest")).toBe(FIGURE_COLORS.muscle);
    first.unmount();

    const after = [
      { exerciseId: "squat", completedSets: 5 },
      { exerciseId: "bench", completedSets: 3 },
    ];
    const { container } = render(<SessionMuscleFigure exercises={after} />);
    // First frame: as it was.
    expect(shapeFill(container, "Front", "chest")).toBe(FIGURE_COLORS.muscle);
    await nextFrame();
    // Then the chest takes its colour, through the fill transition.
    expect(shapeFill(container, "Front", "chest")).toMatch(/var\(--anatomy-heat-[1-4]\)/);
  });

  it("draws a new session's figure straight away", async () => {
    const { container } = render(
      <SessionMuscleFigure exercises={[{ exerciseId: "bench", completedSets: 2 }]} />
    );
    expect(shapeFill(container, "Front", "chest")).toMatch(/var\(--anatomy-heat-[1-4]\)/);
  });
});
