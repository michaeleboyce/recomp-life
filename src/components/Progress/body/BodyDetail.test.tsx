import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { clearDb, makeProfile } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import type { TrainingPhase } from "@/types";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) =>
      isValidElement(children)
        ? cloneElement(children as ReactElement<{ width: number; height: number }>, { width: 350, height: 170 })
        : null,
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/progress/body" }));

import { BodyDetail } from "./BodyDetail";
import { PAGE_SIZE } from "./WeighInList";

const demo = generateDemoData(new Date());
const BAND = ".recharts-reference-area-rect";

async function seed(mode: TrainingPhase["mode"]) {
  await db.bodyweight.bulkPut(demo.bodyweight);
  await db.userProfile.put({
    ...makeProfile(),
    settings: {
      ...DEFAULT_USER_PROFILE.settings,
      trainingPhase: { ...DEFAULT_USER_PROFILE.settings.trainingPhase, mode },
    },
  });
}

beforeEach(async () => {
  cleanup();
  await clearDb();
});

describe("BodyDetail", () => {
  it("labels the change with the real span of the weigh-ins, not the range chip", async () => {
    // Two weeks of data viewed at the default three-month range.
    const now = Date.now();
    await db.bodyweight.bulkPut(
      Array.from({ length: 15 }, (_, i) => ({
        id: `two-weeks-${i}`,
        clientId: `two-weeks-${i}`,
        date: new Date(now - (14 - i) * 86_400_000),
        weight: 200 - i * 0.2,
        timeOfDay: "morning" as const,
        synced: false,
      }))
    );
    await db.userProfile.put(makeProfile());
    render(<BodyDetail />);
    expect(await screen.findByText("in 2 wk")).toBeInTheDocument();
    expect(screen.queryByText("in 3m")).toBeNull();
  });

  it("links back to the Body tab and lists weigh-ins newest first, grouped by month", async () => {
    await seed("cutting");
    render(<BodyDetail />);
    expect(await screen.findByRole("link", { name: "Back" })).toHaveAttribute("href", "/progress?tab=body");
    const list = await screen.findByRole("region", { name: "All weigh-ins" });
    const newest = demo.bodyweight[demo.bodyweight.length - 1];
    const rows = list.querySelectorAll("[data-slot=list-row]");
    expect(rows).toHaveLength(PAGE_SIZE);
    expect(rows[0]).toHaveTextContent(newest.weight.toFixed(1));
    expect(within(list).getAllByRole("heading", { level: 3 }).length).toBeGreaterThanOrEqual(2);
  });

  it("shows 30 entries and the rest after Show all", async () => {
    await seed("cutting");
    render(<BodyDetail />);
    const list = await screen.findByRole("region", { name: "All weigh-ins" });
    fireEvent.click(within(list).getByRole("button", { name: /Show all/ }));
    expect(list.querySelectorAll("[data-slot=list-row]")).toHaveLength(demo.bodyweight.length);
    expect(within(list).queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  it("edits an entry inline through updateBodyweight", async () => {
    await seed("cutting");
    render(<BodyDetail />);
    const list = await screen.findByRole("region", { name: "All weigh-ins" });
    const target = demo.bodyweight[demo.bodyweight.length - 1];
    fireEvent.click(list.querySelectorAll("button[data-slot=list-row]")[0]);
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveValue(target.weight);
    fireEvent.change(input, { target: { value: "201.4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(async () => expect((await db.bodyweight.get(target.id))?.weight).toBe(201.4));
    expect((await db.bodyweight.get(target.id))?.synced).toBe(false);
    await waitFor(() => expect(screen.queryByRole("spinbutton")).toBeNull());
  });

  it("rejects an implausible weight and cancels without saving", async () => {
    await seed("cutting");
    render(<BodyDetail />);
    const list = await screen.findByRole("region", { name: "All weigh-ins" });
    const target = demo.bodyweight[demo.bodyweight.length - 1];
    fireEvent.click(list.querySelectorAll("button[data-slot=list-row]")[0]);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/between 50 and 500/);
    expect((await db.bodyweight.get(target.id))?.weight).toBe(target.weight);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("draws the target band on the rate chart only while cutting", async () => {
    await seed("cutting");
    const cutting = render(<BodyDetail />);
    await screen.findByRole("img", { name: /Weekly rate of change/ });
    await waitFor(() => expect(cutting.container.querySelector(BAND)).not.toBeNull());
    expect(screen.getByText(/0.5 to 1.0 percent/)).toBeInTheDocument();
    cutting.unmount();

    await db.userProfile.clear();
    await seed("maintaining");
    const maintaining = render(<BodyDetail />);
    await screen.findByRole("img", { name: /Weekly rate of change/ });
    expect(maintaining.container.querySelector(BAND)).toBeNull();
    expect(screen.queryByText(/0.5 to 1.0 percent/)).toBeNull();
  });

  it("shows an empty state with no weigh-ins", async () => {
    await db.userProfile.put(makeProfile());
    render(<BodyDetail />);
    expect(await screen.findByText("No weigh-ins yet")).toBeInTheDocument();
  });
});
