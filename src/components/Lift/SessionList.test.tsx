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
    expect(link).toHaveAttribute("href", "/log/workout/w1");
  });
});
