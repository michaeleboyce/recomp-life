// M10: every muscle opens the same chart as a lift, as an index. Made-up sets only.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { muscleStrengthIndex, type StrengthSet } from "@/lib/strength";
import { t1Session } from "@/lib/strength/testHelpers";

const imported = (sets: StrengthSet[]) => sets.map((s) => ({ ...s, imported: true as const }));
const SETS: StrengthSet[] = [
  // A barbell lift,
  ...[0, 4, 8, 12].flatMap((d, i) =>
    t1Session({ sessionId: `g${i}`, exerciseId: "squat", weight: 200 + 5 * i, amrapReps: 5, day: d })
  ),
  // a home exercise that joins later,
  ...[14, 18].flatMap((d, i) =>
    t1Session({ sessionId: `h${i}`, exerciseId: "bulgarian_split_squat", weight: 40 + 5 * i, perHand: true, amrapReps: 8, day: d })
  ),
  // and an imported exercise.
  ...imported(t1Session({ sessionId: "imp", exerciseId: "goblet_squat", weight: 70, amrapReps: 8, day: 2 })),
];

vi.mock("@/hooks/useStrengthEvidence", () => ({ useStrengthEvidence: () => SETS }));

import { MuscleStrengthList } from "./MuscleStrengthList";

afterEach(cleanup);

describe("MuscleStrengthList chart (M10)", () => {
  it("labels each row a strength trend and opens the muscle's chart, whose number is the row's", () => {
    const index = muscleStrengthIndex(SETS);
    render(<MuscleStrengthList index={index} />);
    const row = screen.getByRole("button", { name: /Quads/ });
    expect(row).toHaveTextContent("strength trend");
    const rowNumber = screen.getByTestId("muscle-index-quads").textContent;
    fireEvent.click(row);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTestId("muscle-trend-latest")).toHaveTextContent(rowNumber!);
    const chart = within(dialog).getByRole("img", { name: "Quads strength trend over time" });
    expect(chart).toHaveAttribute("data-line", "smooth");
    const legend = within(within(dialog).getByRole("list", { name: "Sources" }));
    expect(legend.getByRole("checkbox", { name: /Barbell Squat ?main muscle/ })).toBeInTheDocument();
    expect(legend.getByRole("checkbox", { name: /Bulgarian Split Squat/ })).toBeInTheDocument();
    expect(legend.getByRole("checkbox", { name: /Goblet Squat/ })).toBeInTheDocument();
    expect(within(dialog).getByText(/It stays an index/)).toBeInTheDocument();
    // The imported goblet squat is drawn hollow.
    expect(dialog.querySelector('[data-dot="goblet_squat"][data-kind="imported"]')).not.toBeNull();
    expect(within(dialog).getByTestId("contributors-quads")).toHaveTextContent("main");
  });
});
