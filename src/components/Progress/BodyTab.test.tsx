import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeProfile } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import type { TrainingPhase } from "@/types";

// jsdom has no layout, so ResponsiveContainer would measure 0 x 0 and draw nothing.
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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/progress" }));

import { BodyTab } from "./BodyTab";

const demo = generateDemoData(new Date());

async function seed(mode: TrainingPhase["mode"]) {
  await db.bodyweight.bulkPut(demo.bodyweight);
  const base = makeProfile();
  await db.userProfile.put({
    ...base,
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

describe("BodyTab", () => {
  it("shows the latest weight, the change and the three tiles from demo data", async () => {
    await seed("cutting");
    const latest = demo.bodyweight.at(-1)!.weight.toFixed(1);
    render(<BodyTab />);
    const headline = await screen.findByRole("heading", { name: "Bodyweight" });
    const frame = headline.closest("section")!;
    expect(within(frame).getByText(latest)).toBeInTheDocument();
    // Cutting: a drop is good, so the change is not styled as a warning.
    const delta = frame.querySelector("[data-slot=delta]")!;
    expect(delta.textContent).toMatch(/^−\d/);
    expect(delta).toHaveClass("text-success");

    expect(screen.getByText("7-day average")).toBeInTheDocument();
    expect(screen.getByText("Rate of change")).toBeInTheDocument();
    expect(screen.getByText("Total change")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All weigh-ins and details/ })).toHaveAttribute("href", "/progress/body");
    expect(screen.getByRole("link", { name: /Log weight/ })).toHaveAttribute("href", "/weigh-in");
    expect(await screen.findByRole("img", { name: /Bodyweight, 7-day average/ })).toBeInTheDocument();
  });

  it("gives the rate a status word and an evidence line while cutting", async () => {
    await seed("cutting");
    render(<BodyTab />);
    await screen.findByText("Rate of change");
    expect(screen.getByText(/^(on pace|slow|fast)$/)).toBeInTheDocument();
    expect(document.querySelector("[data-evidence=rate-of-loss]")).not.toBeNull();
  });

  it("has no status word or evidence line when maintaining, and no judgement colour", async () => {
    await seed("maintaining");
    render(<BodyTab />);
    await screen.findByText("Rate of change");
    expect(screen.queryByText(/^(on pace|slow|fast)$/)).toBeNull();
    expect(document.querySelector("[data-evidence=rate-of-loss]")).toBeNull();
    const delta = document.querySelector("section [data-slot=delta]")!;
    expect(delta).toHaveClass("text-muted-foreground");
  });

  it("changes the range from the chips", async () => {
    await seed("cutting");
    render(<BodyTab />);
    await screen.findByText("Rate of change");
    fireEvent.click(screen.getByRole("radio", { name: "4w" }));
    expect(screen.getByRole("radio", { name: "4w" })).toBeChecked();
    expect(screen.getByText("in 4w")).toBeInTheDocument();
  });

  it("shows an empty state with a Log weight action when there are no weigh-ins", async () => {
    await db.userProfile.put(makeProfile());
    render(<BodyTab />);
    await waitFor(() => expect(screen.getByText("No weigh-ins yet")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Log weight" })).toHaveAttribute("href", "/weigh-in");
  });
});
