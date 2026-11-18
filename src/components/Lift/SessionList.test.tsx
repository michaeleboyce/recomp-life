import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { importedSession, importedSet } from "@/lib/import/testRecords";
import { SessionList } from "./SessionList";
import { importedLiftSessions, importedPoolFor, type LiftSession } from "./sessions";

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
  meanRepsInReserve: 1.5,
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
    expect(screen.getByTestId("session-row")).toHaveTextContent(/^Nov 6.*40\/hand ×3, 5/);
    expect(list).toContainElement(screen.getByTestId("session-row"));
  });
});

// Made-up imported sessions only: the repository is public.
describe("SessionList with imported sessions", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T12:00:00"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("gives the year of a session from another year", () => {
    const old = importedSession(
      [importedSet({ exerciseName: "Made-up Bench", mappedExerciseId: "bench", weightPerImplementLb: 115, reps: 8 })],
      { id: "imp-2023", startedAt: new Date("2023-03-04T17:00:00") }
    );
    render(<SessionList sessions={[]} imported={importedLiftSessions([old], ["bench"])} />);
    expect(screen.getByTestId("session-row")).toHaveTextContent(/^Mar 42023/);
    expect(screen.getByRole("button", { name: "Open imported session from Mar 4, 2023" })).toBeInTheDocument();
  });

  const dbDay = importedSession(
    [
      importedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 30, reps: 12, role: "warmup" }),
      importedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 50, reps: 10, setOrder: 2 }),
      importedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 40, reps: 8, setOrder: 3, role: "drop" }),
    ],
    { id: "imp-new", sourceApp: "gravl", title: "Push Day", startedAt: new Date("2026-11-08T17:00:00") }
  );
  const barbellDay = importedSession(
    [importedSet({ exerciseName: "Made-up Bench", mappedExerciseId: "bench", weightPerImplementLb: 135, reps: 5 })],
    { id: "imp-old", sourceApp: "fitbod", startedAt: new Date("2026-11-01T17:00:00") }
  );
  const imported = importedLiftSessions([barbellDay, dbDay], importedPoolFor("bench"));
  const own = { ...session, key: "w1-T1", weight: 140 };

  it("lists imported sessions among the app's own by date, labelled with their app", () => {
    render(<SessionList sessions={[own]} imported={imported} />);
    const rows = screen.getAllByTestId("session-row");
    expect(rows.map((r) => r.textContent?.slice(0, 5))).toEqual(["Nov 8", "Nov 6", "Nov 1"]);
    expect(rows[0]).toHaveTextContent(/50\/hand ×10, 8/);
    expect(within(rows[0]).getByText("Imported")).toBeInTheDocument();
    // A home version of the lift is named; the lift itself is not.
    expect(within(rows[0]).getByTestId("session-imported")).toHaveTextContent("Gravl · DB bench press");
    expect(within(rows[2]).getByTestId("session-imported")).toHaveTextContent(/^ImportedFitbod$/);
    expect(within(rows[0]).getByLabelText("8 reps, drop set")).toBeInTheDocument();
    // Imported rows never carry a tier, "best" or a workout link.
    expect(within(rows[0]).queryByRole("link")).toBeNull();
    expect(within(rows[1]).getByRole("link", { name: /open workout from nov 6/i })).toBeInTheDocument();
  });

  it("hides imported sessions on request and shows them again", () => {
    render(<SessionList sessions={[own]} imported={imported} />);
    expect(screen.getByTestId("imported-control")).toHaveTextContent("Includes 2 imported sessions");
    fireEvent.click(screen.getByRole("button", { name: "Hide imported" }));
    expect(screen.getAllByTestId("session-row")).toHaveLength(1);
    expect(screen.getByTestId("imported-control")).toHaveTextContent("2 imported sessions hidden");
    fireEvent.click(screen.getByRole("button", { name: "Show imported" }));
    expect(screen.getAllByTestId("session-row")).toHaveLength(3);
  });

  it("opens an imported session's read-only detail", async () => {
    render(<SessionList sessions={[own]} imported={imported} />);
    fireEvent.click(screen.getByRole("button", { name: "Open imported session from Nov 8" }));
    const sheet = await screen.findByRole("dialog", { name: "Push Day" });
    expect(sheet).toHaveTextContent("Counts as DB Bench Press");
  });

  it("shows imported sessions when the app has none, without the empty message", () => {
    render(<SessionList sessions={[]} imported={imported} empty="No sessions yet." />);
    expect(screen.getAllByTestId("session-row")).toHaveLength(2);
    expect(screen.queryByTestId("sessions-empty")).toBeNull();
  });

  it("in a one-exercise list, does not name the exercise again", () => {
    render(
      <SessionList sessions={[]} homeOnly imported={importedLiftSessions([dbDay], ["db_bench"])} title="DB bench press sessions" />
    );
    expect(screen.getByTestId("session-imported")).toHaveTextContent(/^ImportedGravl$/);
  });
});
