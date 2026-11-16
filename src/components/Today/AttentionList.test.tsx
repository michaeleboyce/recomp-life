import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { listDeleted } from "@/lib/data/logEdits";
import { RecentlyDeleted } from "@/components/LogEdit/RecentlyDeleted";
import { clearDb, makeProfile, makeSet, makeWorkout } from "@/lib/data/testUtils";
import type { Insight } from "@/lib/insights";
import { useInsights } from "@/hooks";
import {
  AttentionList,
  hasAttention,
  PositiveInsightLine,
  useDiscardStaleWorkouts,
} from "./AttentionList";

function Harness() {
  useDiscardStaleWorkouts();
  const insights = useInsights();
  return insights ? <AttentionList insights={insights} /> : null;
}

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const HOUR = 60 * 60 * 1000;

function insight(n: number, overrides: Partial<Insight> = {}): Insight {
  return {
    id: `i-${n}`,
    kind: "deload",
    severity: "warning",
    title: `Insight ${n}`,
    body: `Body ${n}`,
    ...overrides,
  };
}

beforeEach(clearDb);

describe("AttentionList", () => {
  it("renders nothing with no items", () => {
    const { container } = render(<AttentionList insights={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows at most three, and expands the rest in place", () => {
    render(<AttentionList insights={[1, 2, 3, 4, 5].map((n) => insight(n))} />);
    expect(screen.getByRole("heading", { name: "Needs attention" })).toBeInTheDocument();
    expect(screen.getAllByTestId("attention-row")).toHaveLength(3);
    expect(screen.queryByText("Insight 4")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2 more" }));
    expect(screen.getAllByTestId("attention-row")).toHaveLength(5);
    expect(screen.getByText("Insight 5")).toBeInTheDocument();
  });

  it("shows info insights after the warnings, the mild inactivity nudge last", () => {
    // In computeInsights order: severity first, then kind (inactivity before strength-stall).
    render(
      <AttentionList
        insights={[
          insight(1, { severity: "action", kind: "weigh-in-due" }),
          insight(2, { severity: "warning", kind: "deload" }),
          insight(3, { severity: "info", kind: "inactivity" }),
          insight(4, { severity: "info", kind: "strength-stall" }),
          insight(5, { severity: "positive", kind: "new-pr" }),
        ]}
      />
    );
    const rows = screen.getAllByTestId("attention-row");
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.getAttribute("data-severity"))).toEqual(["action", "warning", "info"]);
    expect(rows[2]).toHaveTextContent("Insight 4");
    fireEvent.click(screen.getByRole("button", { name: "1 more" }));
    const all = screen.getAllByTestId("attention-row");
    expect(all).toHaveLength(4);
    expect(all[3]).toHaveTextContent("Insight 3");
    expect(screen.queryByText("Insight 5")).not.toBeInTheDocument();
  });

  it("shows an info insight when it is the only one", () => {
    const stall = insight(1, { severity: "info", kind: "strength-stall", title: "Squat estimated 1RM down" });
    render(<AttentionList insights={[stall]} />);
    expect(screen.getByRole("heading", { name: "Needs attention" })).toBeInTheDocument();
    expect(screen.getByText("Squat estimated 1RM down")).toBeInTheDocument();
  });

  it("hasAttention counts info but not positive insights", () => {
    expect(hasAttention([insight(1, { severity: "info", kind: "inactivity" })])).toBe(true);
    expect(hasAttention([insight(1, { severity: "positive", kind: "new-pr" })])).toBe(false);
    expect(hasAttention([])).toBe(false);
    expect(hasAttention(undefined)).toBe(false);
  });

  it("shows the body, the action link and the evidence icon", () => {
    render(
      <AttentionList
        insights={[
          insight(1, {
            evidenceId: "time-off",
            action: { label: "Log weight", href: "/weigh-in" },
          }),
        ]}
      />
    );
    expect(screen.getByText("Body 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log weight" })).toHaveAttribute("href", "/weigh-in");
    expect(document.querySelector('[data-evidence="time-off"]')).not.toBeNull();
  });

  it("offers Resolved and Still there on a pain check", async () => {
    const date = new Date(Date.now() - 9 * 24 * HOUR);
    await db.painEntries.bulkAdd([
      { id: "p1", clientId: "c-p1", region: "neck", severity: 2, sensation: "pain", date, synced: false },
      { id: "p2", clientId: "c-p2", region: "core", severity: 2, sensation: "pain", date, synced: false },
    ]);
    render(
      <AttentionList
        insights={[
          insight(1, { id: "pain-check:p1", kind: "pain-check", severity: "action" }),
          insight(2, { id: "pain-check:p2", kind: "pain-check", severity: "action" }),
        ]}
      />
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Resolved" })[0]);
    await waitFor(async () => expect((await db.painEntries.get("p1"))?.deletedAt).toEqual(expect.any(Number)));
    fireEvent.click(screen.getAllByRole("button", { name: "Still there" })[1]);
    await waitFor(async () =>
      expect((await db.painEntries.get("p2"))!.date.getTime()).toBeGreaterThan(date.getTime())
    );
  });
});

describe("AttentionList with live insights", () => {
  it("shows a Resume row linking to the active page for an unfinished workout, and Discard removes it", async () => {
    await db.userProfile.put(makeProfile());
    await db.workouts.add(makeWorkout({ id: "w1", startedAt: new Date(Date.now() - HOUR) }));
    render(<Harness />);
    const resume = await screen.findByRole("link", { name: "Resume" });
    expect(resume).toHaveAttribute("href", "/workout/active?sessionId=w1");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(async () => expect((await db.workouts.get("w1"))?.deletedAt).toEqual(expect.any(Number)));
  });

  it("clears unfinished workouts older than a day that have no working set", async () => {
    await db.workouts.add(
      makeWorkout({
        id: "old",
        startedAt: new Date(Date.now() - 48 * HOUR),
        sets: [makeSet({ tier: "warmup" })],
      })
    );
    render(<Harness />);
    await waitFor(async () => expect((await db.workouts.get("old"))?.deletedAt).toEqual(expect.any(Number)));
  });

  describe("a workout left three days ago with sets", () => {
    const startedAt = () => new Date(Date.now() - 72 * HOUR);
    const left = () => {
      const start = startedAt();
      return makeWorkout({
        id: "left",
        startedAt: start,
        sets: [
          makeSet({ id: "s1", completedAt: new Date(start.getTime() + 5 * 60_000) }),
          makeSet({ id: "s2", setNumber: 2, completedAt: new Date(start.getTime() + 9 * 60_000) }),
        ],
      });
    };

    it("is never discarded on its own, and Today asks to save or discard it", async () => {
      await db.userProfile.put(makeProfile());
      await db.workouts.add(left());
      render(<Harness />);

      const row = await screen.findByText(/has 2 working sets logged/);
      expect(row).toHaveTextContent("End & save keeps them");
      expect(screen.getByRole("button", { name: "End & save" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
      // Too old to resume: no Resume link.
      expect(screen.queryByRole("link", { name: "Resume" })).not.toBeInTheDocument();

      await new Promise((r) => setTimeout(r, 50));
      const stored = (await db.workouts.get("left"))!;
      expect(stored.deletedAt ?? null).toBeNull();
      expect(stored.sets).toHaveLength(2);
    });

    it("End & save finishes it at its last set", async () => {
      await db.userProfile.put(makeProfile());
      const workout = left();
      await db.workouts.add(workout);
      render(<Harness />);

      fireEvent.click(await screen.findByRole("button", { name: "End & save" }));
      await waitFor(async () => expect((await db.workouts.get("left"))?.completedAt).not.toBeNull());
      const saved = (await db.workouts.get("left"))!;
      expect(new Date(saved.completedAt!)).toEqual(workout.sets[1].completedAt);
      expect(saved.sets).toHaveLength(2);
      await waitFor(() => expect(screen.queryByRole("button", { name: "End & save" })).not.toBeInTheDocument());
    });

    it("Discard moves it to Recently deleted, and Restore brings it back with its sets", async () => {
      await db.userProfile.put(makeProfile());
      await db.workouts.add(left());
      render(<Harness />);

      fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
      await waitFor(async () => expect((await db.workouts.get("left"))?.deletedAt).toEqual(expect.any(Number)));

      const deleted = await listDeleted();
      expect(deleted).toEqual([
        expect.objectContaining({ table: "workouts", id: "left", label: "Workout A1 (unfinished, 2 sets)" }),
      ]);
      // Restored from the Recently deleted screen itself.
      render(<RecentlyDeleted />);
      fireEvent.click(await screen.findByRole("button", { name: "Restore Workout A1 (unfinished, 2 sets)" }));
      await waitFor(async () => expect((await db.workouts.get("left"))?.deletedAt ?? null).toBeNull());
      const back = (await db.workouts.get("left"))!;
      expect(back.deletedAt ?? null).toBeNull();
      expect(back.sets).toHaveLength(2);
      expect(await screen.findByRole("button", { name: "End & save" })).toBeInTheDocument();
    });
  });

  it("is not rendered for an empty database", async () => {
    const { container } = render(<Harness />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PositiveInsightLine", () => {
  it("shows the first positive insight's title", () => {
    render(
      <PositiveInsightLine
        insights={[insight(1), insight(2, { severity: "positive", title: "New best on Squat" })]}
      />
    );
    expect(screen.getByText("New best on Squat")).toBeInTheDocument();
  });

  it("renders nothing without one", () => {
    const { container } = render(<PositiveInsightLine insights={[insight(1)]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
