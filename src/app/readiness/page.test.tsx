import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeProfile } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import ReadinessPage from "./page";

const nav = vi.hoisted(() => ({ params: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.params),
}));
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

beforeEach(clearDb);
afterEach(() => {
  cleanup();
  nav.params = "";
});

describe("Readiness page", () => {
  it("from an empty database says how to get a score", async () => {
    render(<ReadinessPage />);
    expect(await screen.findByText("No readiness score yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Today" })).toHaveAttribute("href", "/");
  });

  it("from demo data shows the score and what moved it, back to the Ready screen", async () => {
    nav.params = "from=ready";
    const demo = generateDemoData(new Date());
    await db.workouts.bulkPut(demo.workouts);
    await db.liftStates.bulkPut(demo.liftStates);
    await db.readinessLogs.bulkPut(demo.readinessLogs);
    await db.painEntries.bulkPut(demo.painEntries);
    await db.userProfile.put(makeProfile());
    render(<ReadinessPage />);
    expect(await screen.findByRole("img", { name: /^Readiness \d+ out of 100$/ }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "What moved the score" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "What this changes today" })).toHaveTextContent("Weights: nothing.");
    expect(screen.getByRole("link", { name: "Back to Ready" })).toHaveAttribute("href", "/workout/configure");
  });
});
