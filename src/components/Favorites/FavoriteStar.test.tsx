import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeSet, makeWorkout } from "@/lib/data/testUtils";
import { FavoriteStar } from "./FavoriteStar";

const toasts = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/components/ui/toast", () => toasts);

const stamp = { updatedAt: 1, deletedAt: null };

beforeEach(async () => {
  cleanup();
  toasts.toast.mockReset();
  await clearDb();
});

async function addWorkout(id: string, completedAt: Date | null) {
  await db.workouts.add(
    makeWorkout({
      id,
      ...stamp,
      templateId: "A1",
      startedAt: new Date(2026, 10, 10, 9),
      completedAt,
      sets: [makeSet({ id: `${id}-s`, exerciseId: "squat", tier: "T1", weight: 190 })],
    })
  );
}

const star = () => screen.findByRole("button", { name: /favourite/i });

describe("FavoriteStar", () => {
  it("renders nothing for a missing or unfinished workout", async () => {
    await addWorkout("open", null);
    const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
    const { container, rerender } = render(<FavoriteStar sessionId="nope" />);
    await settle();
    expect(container).toBeEmptyDOMElement();
    rerender(<FavoriteStar sessionId="open" />);
    await settle();
    expect(container).toBeEmptyDOMElement();
  });

  it("saves a finished workout under its day and date, then removes it again", async () => {
    await addWorkout("w1", new Date(2026, 10, 10, 10));
    render(<FavoriteStar sessionId="w1" />);

    fireEvent.click(await star());
    await waitFor(async () => expect(await db.favoriteWorkouts.count()).toBe(1));
    const saved = (await db.favoriteWorkouts.toArray())[0];
    expect(saved).toMatchObject({ name: "A1 · 10 Nov", sourceSessionId: "w1", deletedAt: null });
    await waitFor(() => expect(screen.getByRole("button", { name: /remove from favourites/i })).toHaveAttribute("aria-pressed", "true"));

    fireEvent.click(screen.getByRole("button", { name: /remove from favourites/i }));
    await waitFor(async () => expect((await db.favoriteWorkouts.get(saved.id))!.deletedAt).toEqual(expect.any(Number)));
    await waitFor(() => expect(screen.getByRole("button", { name: /save as favourite/i })).toHaveAttribute("aria-pressed", "false"));
  });

  it("starts active when the workout is already a favourite", async () => {
    await addWorkout("w1", new Date(2026, 10, 10, 10));
    const { saveFavoriteFromSession } = await import("@/lib/data/favorites");
    await saveFavoriteFromSession((await db.workouts.get("w1"))!, "Already");
    render(<FavoriteStar sessionId="w1" />);
    expect(await screen.findByRole("button", { name: /remove from favourites/i })).toBeInTheDocument();
  });
});
