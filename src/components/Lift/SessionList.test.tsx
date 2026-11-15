import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionList } from "./SessionList";
import type { LiftSession } from "./sessions";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/Evidence/EvidenceLine", () => ({ EvidenceLine: () => null }));

const session: LiftSession = {
  key: "w1-T1",
  workoutId: "w1",
  t: new Date("2026-11-06T17:30:00").getTime(),
  tier: "T1",
  weight: 210,
  sets: [
    { reps: 3, amrap: false, failed: false },
    { reps: 5, amrap: true, failed: false },
  ],
  rpe: 7.5,
  best: false,
} as LiftSession;

describe("SessionList", () => {
  it("links each session to its workout detail page", () => {
    render(<SessionList sessions={[session]} />);
    const link = screen.getByRole("link", { name: /open workout from nov 6/i });
    expect(link).toHaveAttribute("href", "/log/workout?id=w1");
    expect(screen.queryByTestId("session-home")).toBeNull();
  });

  it("labels a home session with the substitute it was done as", () => {
    render(
      <SessionList
        sessions={[{ ...session, key: "w2-T1-goblet_squat", weight: 60, substituteExerciseId: "goblet_squat" }]}
      />
    );
    expect(screen.getByTestId("session-home")).toHaveTextContent("At home: goblet squat");
  });

  it("shows nothing with no sessions, or the empty message when given one", () => {
    const { container } = render(<SessionList sessions={[]} />);
    expect(container).toBeEmptyDOMElement();
    render(<SessionList sessions={[]} title="DB lunge sessions" empty="No DB lunge sessions yet." />);
    expect(screen.getByRole("region", { name: "DB lunge sessions" })).toHaveTextContent("No DB lunge sessions yet.");
  });

  it("for one home version, does not name it on each row and marks weights per dumbbell", () => {
    render(
      <SessionList
        title="Bulgarian split squat sessions"
        homeOnly
        sessions={[{ ...session, key: "w3-T2-bss", weight: 40, substituteExerciseId: "bulgarian_split_squat" }]}
      />
    );
    const list = screen.getByRole("region", { name: "Bulgarian split squat sessions" });
    expect(screen.queryByTestId("session-home")).toBeNull();
    expect(screen.getByTestId("session-row")).toHaveTextContent(/^Nov 6.*40\/hand ×35/);
    expect(list).toContainElement(screen.getByTestId("session-row"));
  });
});
