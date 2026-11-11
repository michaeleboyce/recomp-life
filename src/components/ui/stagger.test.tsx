import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Stagger } from "./stagger";

describe("Stagger", () => {
  it("wraps each child with animation classes and 50ms default steps", () => {
    render(
      <Stagger>
        <p>a</p>
        <p>b</p>
        <p>c</p>
      </Stagger>
    );
    const wrappers = ["a", "b", "c"].map((t) => screen.getByText(t).parentElement!);
    wrappers.forEach((w, i) => {
      expect(w).toHaveClass(
        "animate-in",
        "fade-in",
        "slide-in-from-bottom-3",
        "fill-mode-both"
      );
      expect(w.style.animationDelay).toBe(`${i * 50}ms`);
      expect(w.style.animationDuration).toBe("300ms");
    });
  });

  it("honours a custom stepMs", () => {
    render(
      <Stagger stepMs={80}>
        <p>a</p>
        <p>b</p>
      </Stagger>
    );
    expect(screen.getByText("b").parentElement!.style.animationDelay).toBe("80ms");
  });

  it("skips null and false children without consuming a delay step", () => {
    render(
      <Stagger>
        {null}
        <p>a</p>
        {false}
        <p>b</p>
      </Stagger>
    );
    expect(screen.getByText("a").parentElement!.style.animationDelay).toBe("0ms");
    expect(screen.getByText("b").parentElement!.style.animationDelay).toBe("50ms");
  });

  it("passes className to the outer container", () => {
    render(
      <Stagger className="space-y-4">
        <p>a</p>
      </Stagger>
    );
    expect(screen.getByText("a").parentElement!.parentElement).toHaveClass("space-y-4");
  });
});
