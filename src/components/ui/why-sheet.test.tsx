import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { DecisionTrace } from "@/types/glass";
import { WhySheet } from "./why-sheet";

const trace: DecisionTrace = {
  subject: { kind: "rest", exerciseId: "deadlift", tier: "T1" },
  result: 210,
  unit: "s",
  steps: [
    {
      id: "tier",
      title: "Heavy sets",
      detail: "T1 rests three minutes.",
      effect: { op: "start", value: 180, unit: "s" },
      ruleId: "rest-heavy",
    },
    {
      id: "cut",
      title: "Cutting phase",
      detail: "Thirty seconds more while cutting.",
      effect: { op: "add", value: 30, unit: "s" },
      ruleId: "rest-cut-bonus",
    },
  ],
};

describe("WhySheet", () => {
  it("shows the title, the result and every step when open", () => {
    render(
      <WhySheet open onOpenChange={() => {}} title="T1 · Deadlift · why this rest" trace={trace}>
        <p>See past adjustments</p>
      </WhySheet>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("T1 · Deadlift · why this rest");
    expect(screen.getByText("3:30")).toHaveAttribute("data-slot", "why-result");
    expect(screen.getByText("Heavy sets")).toBeInTheDocument();
    // Shown once visually and once for screen readers.
    expect(screen.getAllByText("+0:30")).toHaveLength(2);
    expect(screen.getByText(/2 checks, in the order/)).toBeInTheDocument();
    expect(screen.getByText("See past adjustments")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(<WhySheet open={false} onOpenChange={() => {}} title="Why" trace={trace} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("has a 44px close button that closes the sheet", () => {
    const onOpenChange = vi.fn();
    render(<WhySheet open onOpenChange={onOpenChange} title="Why" trace={trace} />);
    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toHaveClass("size-11");
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows the unit and scheme beside a weight", () => {
    render(
      <WhySheet
        open
        onOpenChange={() => {}}
        title="Why"
        subtitle="5×3+"
        trace={{ ...trace, unit: "lb", result: 215, steps: [] }}
      />
    );
    expect(screen.getByText("lb · 5×3+")).toBeInTheDocument();
  });
});
