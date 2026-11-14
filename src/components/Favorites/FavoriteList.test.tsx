import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FavoriteList } from "./FavoriteList";
import { testFavorite } from "./testFavorites";

afterEach(cleanup);

const NOW = new Date(2026, 10, 12, 10, 0, 0);

describe("FavoriteList", () => {
  it("lists favourites most recently used first and leaves out deleted ones", () => {
    const old = testFavorite("a", "Old one", { createdAt: new Date(2026, 9, 1) });
    const recent = testFavorite("b", "Recent one", { lastUsedAt: new Date(2026, 10, 10) });
    const gone = { ...testFavorite("c", "Gone one"), deletedAt: 1 };
    render(<FavoriteList favorites={[old, gone, recent]} now={NOW} onStart={vi.fn()} />);
    const names = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(names).toEqual(["Recent one", "Old one"]);
  });

  it("calls back with the favourite id", () => {
    const onStart = vi.fn();
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(
      <FavoriteList
        favorites={[testFavorite("a", "Only one")]}
        now={NOW}
        onStart={onStart}
        onRename={onRename}
        onDelete={onDelete}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Exactly as saved" }));
    expect(onStart).toHaveBeenCalledWith("a", "as-saved");
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "New name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onRename).toHaveBeenCalledWith("a", "New name");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onDelete).toHaveBeenCalledWith("a");
  });

  it("shows an empty state telling the user how to add one", () => {
    render(<FavoriteList favorites={[]} now={NOW} onStart={vi.fn()} />);
    expect(screen.getByText("No favourites yet")).toBeInTheDocument();
    expect(screen.getByText(/Save a workout from the start screen/)).toBeInTheDocument();
  });
});
