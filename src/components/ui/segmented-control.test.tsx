import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SegmentedControl } from "./segmented-control";

const OPTIONS = [
  { value: "a", label: "Strength" },
  { value: "b", label: "Recovery" },
];

afterEach(cleanup);

describe("SegmentedControl", () => {
  it("reports the option that was chosen", () => {
    const onChange = vi.fn();
    render(<SegmentedControl value="a" onChange={onChange} options={OPTIONS} />);
    fireEvent.click(screen.getByRole("button", { name: "Recovery" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("uses the roomy size by default", () => {
    render(<SegmentedControl value="a" onChange={() => {}} options={OPTIONS} />);
    const segment = screen.getByRole("button", { name: "Strength" });
    expect(segment).toHaveAttribute("data-size", "default");
    expect(segment).toHaveClass("px-3", "text-sm");
    expect(segment).not.toHaveClass("min-h-11");
  });

  it("compact tightens padding and text but keeps a 44px tap height and whole labels", () => {
    render(<SegmentedControl value="a" onChange={() => {}} options={OPTIONS} size="compact" />);
    for (const name of ["Strength", "Recovery"]) {
      const segment = screen.getByRole("button", { name });
      expect(segment).toHaveAttribute("data-size", "compact");
      expect(segment).toHaveClass("min-h-11", "px-1", "text-xs", "whitespace-nowrap");
      expect(segment).not.toHaveClass("px-3", "text-sm", "truncate");
    }
  });
});
