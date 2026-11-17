// While its data loads, each part of an exercise's page shows a placeholder, never the
// words it shows when there is no data ("You have not done it yet", "No T3 sessions").
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { makeProfile } from "@/lib/data/testUtils";

vi.mock("@/hooks", () => ({
  useSettings: () => makeProfile().settings,
  useLiftStates: () => [],
}));
vi.mock("@/components/chart-kit/LazyTrendChart", () => ({
  LazyTrendChart: () => <div role="img" />,
  TrendChartSkeleton: () => null,
}));

import { CountsToward } from "./CountsToward";
import { OwnStrength, T3Strength } from "./ExerciseStrength";
import { PlannedNextSession } from "./NextSession";

afterEach(cleanup);

const store = { plans: {}, save: vi.fn() };

describe("an exercise page while its data loads", () => {
  it("the next session does not say the exercise was never done before its sessions load", () => {
    render(
      <PlannedNextSession
        exerciseId="dumbbell_curl"
        name="Dumbbell curl"
        kind={{ kind: "accessory" }}
        next={null}
        location="gym"
        sessions={undefined}
        store={store}
      />
    );
    expect(screen.queryByText("You have not done it yet.")).toBeNull();
    expect(screen.queryByTestId("not-planned")).toBeNull();
  });

  it("a T3's last sets do not say there are none before they load", () => {
    render(<T3Strength sessions={undefined} />);
    expect(screen.queryByText("No T3 sessions yet.")).toBeNull();
  });

  it("the strength chart does not say how to get an estimate before the sets load", () => {
    render(<OwnStrength exerciseId="bulgarian_split_squat" name="Bulgarian split squat" sets={undefined} />);
    expect(screen.queryByText(/gives its estimate/)).toBeNull();
  });

  it("a home version's counts toward does not show a missing estimate before the sets load", () => {
    render(<CountsToward exerciseId="bulgarian_split_squat" kind={{ kind: "home", liftId: "squat" }} sets={undefined} />);
    expect(screen.queryByTestId("pooled-estimate")).toBeNull();
  });
});
