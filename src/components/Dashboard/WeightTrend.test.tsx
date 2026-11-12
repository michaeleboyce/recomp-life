import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeProfile } from "@/lib/data/testUtils";
import WeightTrend from "./WeightTrend";

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

describe("WeightTrend", () => {
  it("shows the greeting name and the 7-day average of recent entries only", async () => {
    await db.userProfile.add(makeProfile({ name: "Sam" }));
    await db.bodyweight.bulkAdd([entry("a", 10, 190), entry("b", 3, 180), entry("c", 1, 176)]);
    render(<WeightTrend />);
    expect(await screen.findByText(/7-day avg: 178\.0 lbs/)).toBeInTheDocument();
    expect(screen.getByText(/, Sam/)).toBeInTheDocument();
  });
});
