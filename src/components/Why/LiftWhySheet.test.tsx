import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeProfile } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { updateSettings } from "@/lib/data/records";
import { LiftWhySheet } from "./LiftWhySheet";

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
  window.history.replaceState(null, "", "/");
});

async function seedDemo() {
  const demo = generateDemoData(new Date());
  await db.workouts.bulkPut(demo.workouts);
  await db.estimated1RMs.bulkPut(demo.estimated1RMs);
  await db.liftStates.bulkPut(demo.liftStates);
  await db.userProfile.put(makeProfile());
}

describe("LiftWhySheet", () => {
  it("renders nothing without ?why=", () => {
    const { container } = render(<LiftWhySheet />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens from ?why= with the checks, the rest and your call; closing clears it", async () => {
    await seedDemo();
    nav.params = "why=squat:T1";
    window.history.replaceState(null, "", "/?why=squat:T1");
    render(<LiftWhySheet />);

    const dialog = await screen.findByRole("dialog", {}, { timeout: 5000 });
    expect(within(dialog).getByText(/T1 · Squat · why this weight/)).toBeInTheDocument();
    const steps = within(dialog).getByRole("list", { name: /in the order the app ran them/ });
    expect(within(steps).getAllByRole("listitem").length).toBeGreaterThan(2);

    // The three choices, with chances once the forecast is worked out.
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: /the plan, \d+% chance of a new best/ })).toBeInTheDocument()
    );
    expect(within(dialog).getByRole("button", { name: /lighter/ })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /heavier/ })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /^Rest/ }));
    expect(within(dialog).getByText(/T1 · Squat · why this rest/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(window.location.search).toBe("");
  });

  it("at home explains the dumbbell version", async () => {
    await seedDemo();
    await updateSettings({ defaultLocation: "home" });
    nav.params = "why=squat:T1";
    render(<LiftWhySheet />);
    const dialog = await screen.findByRole("dialog", {}, { timeout: 5000 });
    expect(within(dialog).getByText(/At home:/)).toBeInTheDocument();
    expect(within(dialog).getByText(/why this weight/)).toHaveTextContent(/Goblet squat/i);
  });

  it("stays closed for a lift that is not in the next workout", async () => {
    await seedDemo();
    nav.params = "why=overhead_press:T3";
    render(<LiftWhySheet />);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
