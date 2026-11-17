import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("@/components/ExerciseDemo/ExerciseViewer", () => ({
  ExerciseViewer: ({ exerciseId }: { exerciseId: string }) => <div data-testid="viewer">{exerciseId}</div>,
}));
vi.mock("./PreferenceControl", () => ({ PreferenceControl: () => null }));

import { ExerciseForm } from "./ExerciseForm";

afterEach(cleanup);

describe("ExerciseForm", () => {
  it("shows the demo, the muscles and the alternatives, each opening its own page", () => {
    render(<ExerciseForm exerciseId="bulgarian_split_squat" />);
    expect(screen.getByTestId("viewer")).toHaveTextContent("bulgarian_split_squat");
    expect(screen.getByRole("region", { name: "Muscles" })).toHaveTextContent("Primary");
    const alternatives = screen.getByRole("region", { name: "Alternatives" });
    expect(within(alternatives).getByRole("link", { name: /Barbell Squat/ })).toHaveAttribute(
      "href",
      "/progress/lift/squat"
    );
    expect(within(alternatives).getByRole("link", { name: /Goblet/ })).toHaveAttribute("href", "/exercises/goblet_squat");
  });

  it("has no estimated 1RM: strength is on the Training tab", () => {
    render(<ExerciseForm exerciseId="db_row" />);
    expect(screen.queryByText(/Estimated 1RM/)).toBeNull();
    expect(screen.queryByText(/Complete an AMRAP set/)).toBeNull();
  });
});
