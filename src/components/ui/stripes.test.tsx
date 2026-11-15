import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Stripes } from "./stripes";

describe("Stripes", () => {
  it("draws three token-coloured bands hidden from assistive tech", () => {
    const { container } = render(<Stripes className="w-24" />);
    const root = container.firstElementChild!;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root).toHaveClass("w-24");
    const bands = root.querySelectorAll("i");
    expect(bands).toHaveLength(3);
    expect(bands[0].className).toContain("bg-[var(--stripe-1)]");
    expect(bands[2].className).toContain("bg-[var(--stripe-3)]");
  });
});
