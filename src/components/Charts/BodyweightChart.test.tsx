import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb } from "@/lib/data/testUtils";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import BodyweightChart from "./BodyweightChart";

beforeEach(clearDb);

const DAY = 24 * 60 * 60 * 1000;
const entry = (id: string, daysAgo: number, weight: number) => ({
  id,
  clientId: id,
  date: new Date(Date.now() - daysAgo * DAY),
  weight,
  timeOfDay: "morning" as const,
  synced: false,
});
const cutting = { ...DEFAULT_USER_PROFILE.settings.trainingPhase, mode: "cutting" as const };

describe("BodyweightChart", () => {
  it("renders with three entries in the last 30 days when cutting", async () => {
    await db.bodyweight.bulkAdd([entry("a", 3, 180), entry("b", 2, 179), entry("c", 1, 178)]);
    render(<BodyweightChart trainingPhase={cutting} />);
    expect(await screen.findByText("Bodyweight Trend")).toBeInTheDocument();
  });

  it("ignores entries older than 30 days", async () => {
    await db.bodyweight.bulkAdd([entry("a", 40, 180), entry("b", 35, 179), entry("c", 1, 178)]);
    render(<BodyweightChart trainingPhase={cutting} />);
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByText("Bodyweight Trend")).not.toBeInTheDocument();
  });
});
