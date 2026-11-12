import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { RangeKey } from "@/lib/metrics/types";
import { RangeTabs } from "./RangeTabs";

function Harness({ onChange }: { onChange?: (r: RangeKey) => void }) {
  const [value, setValue] = useState<RangeKey>("3m");
  return (
    <RangeTabs
      value={value}
      onChange={(r) => {
        setValue(r);
        onChange?.(r);
      }}
    />
  );
}

describe("RangeTabs", () => {
  it("is a radiogroup of four labelled radio buttons with the value checked", () => {
    render(<RangeTabs value="3m" onChange={() => {}} />);
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["4w", "3m", "1y", "All"]);
    expect(radios.every((r) => r.tagName === "BUTTON")).toBe(true);
    expect(screen.getByRole("radio", { name: "3m" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "4w" })).toHaveAttribute("aria-checked", "false");
  });

  it("calls onChange when a range is clicked", () => {
    const onChange = vi.fn();
    render(<RangeTabs value="3m" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "1y" }));
    expect(onChange).toHaveBeenCalledWith("1y");
  });

  it("only the checked option is in the tab order", () => {
    render(<RangeTabs value="1y" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "1y" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "4w" })).toHaveAttribute("tabindex", "-1");
  });

  it("moves and selects with the arrow keys, Home and End", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const threeM = screen.getByRole("radio", { name: "3m" });
    fireEvent.keyDown(threeM, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("1y");
    expect(screen.getByRole("radio", { name: "1y" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("radio", { name: "1y" }), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("radio", { name: "All" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("4w");
    fireEvent.keyDown(screen.getByRole("radio", { name: "4w" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("all");
    fireEvent.keyDown(screen.getByRole("radio", { name: "All" }), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("4w");
    fireEvent.keyDown(screen.getByRole("radio", { name: "4w" }), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("all");
  });

  it("limits the options when given", () => {
    render(<RangeTabs value="4w" onChange={() => {}} options={["4w", "3m"]} />);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("buttons are at least 32px tall with a 44px hit area", () => {
    render(<RangeTabs value="4w" onChange={() => {}} />);
    const cls = screen.getByRole("radio", { name: "4w" }).className;
    expect(cls).toMatch(/\bh-8\b/);
    expect(cls).toMatch(/before:-inset-y-1\.5/);
    expect(cls).toMatch(/\bfont-mono\b/);
  });
});
