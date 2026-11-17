import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { testFavorite } from "@/components/Favorites/testFavorites";
import { clearDb } from "@/lib/data/testUtils";
import FavoritesPage from "./page";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const toasts = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/components/ui/toast", () => toasts);

beforeEach(async () => {
  cleanup();
  await clearDb();
  nav.push.mockReset();
  toasts.toast.mockReset();
});

describe("favourites page", () => {
  it("goes back to More and shows the empty state when nothing is saved", async () => {
    render(<FavoritesPage />);
    expect(await screen.findByText("No favourites yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute("href", "/more");
  });

  it("lists saved workouts and starts one in either mode", async () => {
    await db.favoriteWorkouts.add(testFavorite("fav-1", "Quick A1"));
    render(<FavoritesPage />);
    expect(await screen.findByRole("heading", { name: "Quick A1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Today's weights" }));
    expect(nav.push).toHaveBeenLastCalledWith("/workout/configure?favorite=fav-1&mode=current");
    fireEvent.click(screen.getByRole("button", { name: "Exactly as saved" }));
    expect(nav.push).toHaveBeenLastCalledWith("/workout/configure?favorite=fav-1&mode=as-saved");
  });

  it("renames a favourite", async () => {
    await db.favoriteWorkouts.add(testFavorite("fav-1", "Quick A1"));
    render(<FavoritesPage />);
    await screen.findByRole("heading", { name: "Quick A1" });
    fireEvent.click(screen.getByRole("button", { name: /rename/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Heavy A1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("heading", { name: "Heavy A1" })).toBeInTheDocument();
    expect((await db.favoriteWorkouts.get("fav-1"))!.name).toBe("Heavy A1");
  });

  it("deletes with an Undo that brings it back", async () => {
    await db.favoriteWorkouts.add(testFavorite("fav-1", "Quick A1"));
    render(<FavoritesPage />);
    await screen.findByRole("heading", { name: "Quick A1" });
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Quick A1" })).toBeNull());
    const shown = toasts.toast.mock.calls[0][0];
    expect(shown.message).toBe("Quick A1 deleted");
    expect(shown.action.label).toBe("Undo");

    await shown.action.onAction();
    expect(await screen.findByRole("heading", { name: "Quick A1" })).toBeInTheDocument();
    expect((await db.favoriteWorkouts.get("fav-1"))!.deletedAt).toBeNull();
  });

  it("says so when a rename or a delete cannot be saved, instead of failing silently", async () => {
    await db.favoriteWorkouts.add(testFavorite("fav-1", "Quick A1"));
    render(<FavoritesPage />);
    await screen.findByRole("heading", { name: "Quick A1" });
    const update = vi.spyOn(db.favoriteWorkouts, "update").mockRejectedValue(new Error("disk full"));
    try {
      fireEvent.click(screen.getByRole("button", { name: /rename/i }));
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "Heavy A1" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(toasts.toast).toHaveBeenLastCalledWith({ message: "Could not rename Quick A1: disk full" })
      );

      fireEvent.click(screen.getByRole("button", { name: /delete/i }));
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
      await waitFor(() =>
        expect(toasts.toast).toHaveBeenLastCalledWith({ message: "Could not delete Quick A1: disk full" })
      );
      expect(screen.getByRole("heading", { name: "Quick A1" })).toBeInTheDocument();
    } finally {
      update.mockRestore();
    }
  });

  it("says so when Undo cannot bring a deleted favourite back", async () => {
    await db.favoriteWorkouts.add(testFavorite("fav-1", "Quick A1"));
    render(<FavoritesPage />);
    await screen.findByRole("heading", { name: "Quick A1" });
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(toasts.toast).toHaveBeenCalled());
    const shown = toasts.toast.mock.calls[0][0];

    const update = vi.spyOn(db.favoriteWorkouts, "update").mockRejectedValue(new Error("disk full"));
    try {
      await shown.action.onAction();
      expect(toasts.toast).toHaveBeenLastCalledWith({ message: "Could not restore Quick A1: disk full" });
    } finally {
      update.mockRestore();
    }
  });
});
