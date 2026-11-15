import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkoutFigure } from "./workout-figure";

describe("WorkoutFigure", () => {
  it("names the workout's lifts and draws front and back", () => {
    const { container } = render(
      <WorkoutFigure exerciseIds={["deadlift", "ohp", "lat_pulldown"]} />
    );
    const group = screen.getByRole("group", {
      name: "Muscles worked by Barbell Deadlift, Barbell OHP and Lat Pulldown",
    });
    expect(group).toHaveClass("h-32");
    expect(container.querySelectorAll("svg").length).toBe(2);
  });

  it("draws one view when asked and colours the worked muscles", () => {
    const { container } = render(
      <WorkoutFigure exerciseIds={["squat"]} views={["front"]} className="h-24" />
    );
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(screen.getByRole("group")).toHaveClass("h-24");
    expect(container.querySelectorAll("path[fill], [style*='fill']").length).toBeGreaterThan(0);
  });
});
