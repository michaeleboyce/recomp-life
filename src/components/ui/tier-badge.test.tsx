import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TierBadge } from "./tier-badge";

describe("TierBadge", () => {
  it("renders the tier label with solid styling by default", () => {
    render(<TierBadge tier="T1" />);
    const el = screen.getByText("T1");
    expect(el).toHaveClass("bg-tier-t1");
    expect(el).toHaveClass("font-mono");
    expect(el).toHaveAttribute("data-slot", "tier-badge");
  });

  it("renders the soft variant", () => {
    render(<TierBadge tier="T2" variant="soft" />);
    const el = screen.getByText("T2");
    expect(el).toHaveClass("bg-tier-t2-soft", "text-tier-t2");
    expect(el).not.toHaveClass("bg-tier-t2");
  });

  it("uses readable labels for accessory and warmup", () => {
    render(
      <>
        <TierBadge tier="accessory" />
        <TierBadge tier="warmup" />
      </>
    );
    expect(screen.getByText("Accessory")).toBeInTheDocument();
    expect(screen.getByText("Warm-up")).toBeInTheDocument();
  });

  it("passes className through", () => {
    render(<TierBadge tier="T3" className="ml-2" />);
    expect(screen.getByText("T3")).toHaveClass("ml-2");
  });
});
