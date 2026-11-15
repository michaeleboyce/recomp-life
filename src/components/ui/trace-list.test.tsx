import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { DecisionTrace } from "@/types/glass";
import { TraceList, formatTraceEffect } from "./trace-list";

const trace: DecisionTrace = {
  subject: { kind: "weight", exerciseId: "deadlift", tier: "T1" },
  result: 215,
  unit: "lb",
  steps: [
    {
      id: "last-session",
      title: "Last time, Nov 6",
      detail: "205 × 3, 3, 3, 3, 5. Every set hit its target.",
      effect: { op: "start", value: 205, unit: "lb" },
    },
    {
      id: "progression",
      title: "Progression",
      detail: "A pass adds your lower-body step.",
      effect: { op: "add", value: 10, unit: "lb" },
      ruleId: "gzclp-progression",
    },
    {
      id: "readiness",
      title: "Readiness 78",
      detail: "The plan only eases under 5 h with low energy.",
      effect: { op: "none", unit: "lb" },
      ruleId: "readiness-score",
    },
    {
      id: "plates",
      title: "Plates",
      detail: "Loads exactly.",
      effect: { op: "round", value: 215, unit: "lb" },
    },
  ],
  alternatives: [
    { label: "easier", value: 210, note: "74%" },
    { label: "the plan", value: 215, note: "58%" },
    { label: "harder", value: 220, note: "31%" },
  ],
};

describe("formatTraceEffect", () => {
  it("formats each kind of effect", () => {
    expect(trace.steps.map(formatTraceEffect)).toEqual(["205", "+10", "+0", "215"]);
    expect(
      formatTraceEffect({ id: "x", title: "", detail: "", effect: { op: "add", value: -5, unit: "lb" } })
    ).toBe("−5");
    expect(
      formatTraceEffect({ id: "x", title: "", detail: "", effect: { op: "set", value: 210, unit: "s" } })
    ).toBe("3:30");
  });
});

describe("TraceList", () => {
  it("numbers the steps in order with title, detail and effect", () => {
    render(<TraceList trace={trace} />);
    const items = within(screen.getAllByRole("list")[0]).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("1");
    expect(items[0]).toHaveTextContent("Last time, Nov 6");
    expect(items[1]).toHaveTextContent("+10");
    expect(items[3]).toHaveTextContent("Plates");
  });

  it("shows the grade of the rule behind a step, and none where there is no rule", () => {
    render(<TraceList trace={trace} />);
    const items = within(screen.getAllByRole("list")[0]).getAllByRole("listitem");
    expect(within(items[1]).getByText("Program rule")).toBeInTheDocument();
    expect(within(items[2]).getByText("Heuristic")).toBeInTheDocument();
    expect(items[0].querySelector('[data-slot="grade-chip"]')).toBeNull();
  });

  it("reads the effect with its unit for screen readers", () => {
    render(<TraceList trace={trace} />);
    expect(screen.getByText("+10 lb")).toHaveClass("sr-only");
  });

  it("shows alternatives for information, marking the planned one", () => {
    const { container } = render(<TraceList trace={trace} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("[data-current]")).toHaveTextContent("215");
  });

  it("makes alternatives buttons when a choice handler is given", () => {
    const onChoose = vi.fn();
    render(<TraceList trace={trace} onChooseAlternative={onChoose} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[1]).toHaveAttribute("aria-pressed", "true");
    expect(buttons[0]).toHaveClass("min-h-14");
    fireEvent.click(buttons[2]);
    expect(onChoose).toHaveBeenCalledWith(trace.alternatives![2]);
  });
});
