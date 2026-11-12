import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChipGroup } from "./chip-group";

afterEach(cleanup);

const OPTIONS = [
  { value: "4w", label: "4w" },
  { value: "3m", label: "3m" },
  { value: "1y", label: "1y" },
];

function setup(value = "3m", size?: "sm" | "md") {
  const onChange = vi.fn();
  render(
    <ChipGroup options={OPTIONS} value={value} onChange={onChange} ariaLabel="Range" size={size} />
  );
  return onChange;
}

describe("ChipGroup", () => {
  it("is a labelled radiogroup of radios with aria-checked", () => {
    setup();
    expect(screen.getByRole("radiogroup", { name: "Range" })).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "3m" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "4w" })).toHaveAttribute("aria-checked", "false");
  });

  it("styles the selected chip with the accent and keeps 44px hit targets", () => {
    setup("3m", "sm");
    expect(screen.getByRole("radio", { name: "3m" })).toHaveClass("border-primary", "bg-primary/15");
    for (const r of screen.getAllByRole("radio")) expect(r).toHaveClass("min-h-[44px]");
  });

  it("calls onChange when clicked", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("radio", { name: "1y" }));
    expect(onChange).toHaveBeenCalledWith("1y");
  });

  it("only the selected chip is tabbable", () => {
    setup("3m");
    expect(screen.getByRole("radio", { name: "3m" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "4w" })).toHaveAttribute("tabindex", "-1");
  });

  it.each([
    ["ArrowRight", "3m", "1y"],
    ["ArrowDown", "3m", "1y"],
    ["ArrowLeft", "3m", "4w"],
    ["ArrowUp", "3m", "4w"],
    ["ArrowRight", "1y", "4w"],
    ["ArrowLeft", "4w", "1y"],
    ["Home", "1y", "4w"],
    ["End", "4w", "1y"],
  ])("%s from %s selects %s", (key, from, to) => {
    const onChange = setup(from);
    fireEvent.keyDown(screen.getByRole("radio", { name: from }), { key });
    expect(onChange).toHaveBeenCalledWith(to);
  });

  it("ignores other keys", () => {
    const onChange = setup();
    fireEvent.keyDown(screen.getByRole("radio", { name: "3m" }), { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
