import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { muscleStrengthIndex } from "@/lib/strength";
import { makeT1Session } from "@/lib/strength/testHelpers";
import { MuscleStrengthList } from "./MuscleStrengthList";

afterEach(cleanup);

const bss = [40, 45, 50].flatMap((w, i) =>
  makeT1Session({ sessionId: `h${i}`, exerciseId: "bulgarian_split_squat", weight: w, perHand: true, amrapReps: 8, day: 3 * i })
);

describe("MuscleStrengthList", () => {
  it("H7: shows a quads trend from Bulgarian split squat data alone, and what fed it on tap", () => {
    render(<MuscleStrengthList index={muscleStrengthIndex(bss)} />);
    const quads = screen.getByRole("button", { name: /quads/i });
    expect(quads).toHaveTextContent(/\d+\.\d/);
    expect(quads).toHaveTextContent("+");
    expect(screen.getByText(/not a weight in pounds/)).toBeInTheDocument();
    fireEvent.click(quads);
    expect(screen.getByTestId("contributors-quads")).toHaveTextContent("Bulgarian Split Squat");
    expect(screen.getByTestId("contributors-quads")).toHaveTextContent("main");
  });

  it("says what to do when there is no data", () => {
    render(<MuscleStrengthList index={{}} />);
    expect(screen.getByText(/No strength trend yet/)).toBeInTheDocument();
  });
});
