import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChartFrame } from "./ChartFrame";

describe("ChartFrame", () => {
  it("lays out title, value, change, actions, chart and footer", () => {
    render(
      <ChartFrame
        title="Total of four lifts, est. 1RM"
        value="792"
        change={<span>+61 in 8 wk</span>}
        actions={<button type="button">3m</button>}
        footer={<p>Footer note</p>}
      >
        <div data-testid="chart" />
      </ChartFrame>
    );
    expect(screen.getByRole("heading", { name: "Total of four lifts, est. 1RM" })).toBeInTheDocument();
    expect(screen.getByText("792")).toHaveClass("font-mono");
    expect(screen.getByText("+61 in 8 wk")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3m" })).toBeInTheDocument();
    expect(screen.getByTestId("chart")).toBeInTheDocument();
    expect(screen.getByText("Footer note")).toBeInTheDocument();
  });

  it("renders without the optional slots", () => {
    const { container } = render(
      <ChartFrame title="Bodyweight">
        <div />
      </ChartFrame>
    );
    expect(container.querySelector("footer")).toBeNull();
  });
});
