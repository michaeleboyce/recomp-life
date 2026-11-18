import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { DAY_MS } from "@/lib/dates";
import { SLIDER_CONTEXT } from "./trendGeometry";
import type { Span } from "./trendGeometry";
import { WindowRange } from "./WindowRange";

afterEach(cleanup);

// Made up: three years of history ending today, a 4-week window.
const NOW = new Date(2026, 10, 18, 12).getTime();
const LIMITS = { from: NOW - 1100 * DAY_MS, to: NOW };
const FOUR_WEEKS = { from: NOW - 28 * DAY_MS, to: NOW };

function Harness({ initial }: { initial: Span }) {
  const [span, setSpan] = useState(initial);
  return (
    <>
      <WindowRange value={span} limits={LIMITS} onChange={setSpan} />
      <output data-testid="span">{`${Math.round((span.to - span.from) / DAY_MS)}`}</output>
    </>
  );
}

const start = () => screen.getByRole("slider", { name: "Window start" });
const end = () => screen.getByRole("slider", { name: "Window end" });
const trackDays = () => Number(start().getAttribute("max")) - Number(start().getAttribute("min"));
const position = (el: HTMLElement) =>
  (Number((el as HTMLInputElement).value) - Number(el.getAttribute("min"))) / trackDays();

describe("WindowRange (Q1: the zoom slider at a short window)", () => {
  it("scales its track to the window plus context, so the two handles sit well apart", () => {
    render(<Harness initial={FOUR_WEEKS} />);
    expect(trackDays()).toBe(28 * SLIDER_CONTEXT);
    // At 390 px the track is about 342 px wide: the handles are over 44 px apart.
    expect((position(end()) - position(start())) * 342).toBeGreaterThanOrEqual(44);
  });

  it("spans the whole history for a long window", () => {
    render(<Harness initial={LIMITS} />);
    expect(trackDays()).toBe(1100);
    expect(position(start())).toBe(0);
    expect(position(end())).toBe(1);
  });

  it("keeps the track still while a handle is dragged, then widens it on release", () => {
    render(<Harness initial={FOUR_WEEKS} />);
    const min = Number(start().getAttribute("min"));
    fireEvent.pointerDown(start());
    fireEvent.change(start(), { target: { value: String(min) } });
    expect(screen.getByTestId("span")).toHaveTextContent(String(28 * SLIDER_CONTEXT));
    expect(Number(start().getAttribute("min"))).toBe(min);
    act(() => {
      window.dispatchEvent(new Event("pointerup"));
    });
    expect(Number(start().getAttribute("min"))).toBeLessThan(min);
    expect(trackDays()).toBe(28 * SLIDER_CONTEXT * SLIDER_CONTEXT);
  });

  it("still works from the keyboard and names each end by its date", () => {
    render(<Harness initial={FOUR_WEEKS} />);
    const value = Number((start() as HTMLInputElement).value);
    fireEvent.change(start(), { target: { value: String(value - 1) } });
    expect(screen.getByTestId("span")).toHaveTextContent("29");
    expect(start()).toHaveAttribute("aria-valuetext", expect.stringMatching(/^[A-Z][a-z]{2} \d+/));
    expect(end()).toHaveAttribute("aria-valuetext", "Nov 18");
  });

  it("never lets the ends cross: the window stays at least a week", () => {
    render(<Harness initial={FOUR_WEEKS} />);
    fireEvent.change(start(), { target: { value: (end() as HTMLInputElement).value } });
    expect(screen.getByTestId("span")).toHaveTextContent("7");
  });
});
