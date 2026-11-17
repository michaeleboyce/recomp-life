import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PlanYou } from "./PlanYou";

afterEach(cleanup);

describe("PlanYou", () => {
  it("puts the plan's number beside yours", () => {
    const { container } = render(<PlanYou planWeight={60} weight={70} planReps={8} reps={8} />);
    expect(container).toHaveTextContent("Plan 60 · You 70");
  });

  it("shows the reps when they differ", () => {
    const { container } = render(<PlanYou planWeight={60} weight={60} planReps={8} reps={10} />);
    expect(container).toHaveTextContent("Plan 60×8 · You 60×10");
  });
});
