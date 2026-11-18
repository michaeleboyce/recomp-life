import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FavoritePickerSheet } from "./FavoritePickerSheet";
import { makeFavorite } from "./testFavorites";

afterEach(cleanup);

const NOW = new Date(2026, 10, 12, 10, 0, 0);

describe("FavoritePickerSheet", () => {
  it("renders nothing when closed", () => {
    render(
      <FavoritePickerSheet open={false} onOpenChange={vi.fn()} favorites={[]} now={NOW} onStart={vi.fn()} />
    );
    expect(screen.queryByText("Favourites")).toBeNull();
  });

  it("lists favourites with only the start actions", () => {
    render(
      <FavoritePickerSheet
        open
        onOpenChange={vi.fn()}
        favorites={[makeFavorite("a", "Heavy legs")]}
        now={NOW}
        onStart={vi.fn()}
      />
    );
    expect(screen.getByText("Favourites")).toBeInTheDocument();
    expect(screen.getByText("Heavy legs")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("starts the chosen favourite in the chosen mode", () => {
    const onStart = vi.fn();
    const a = makeFavorite("a", "First", { lastUsedAt: new Date(2026, 10, 11) });
    const b = makeFavorite("b", "Second", { createdAt: new Date(2026, 9, 1) });
    render(<FavoritePickerSheet open onOpenChange={vi.fn()} favorites={[b, a]} now={NOW} onStart={onStart} />);
    const todays = screen.getAllByRole("button", { name: "Today's weights" });
    fireEvent.click(todays[1]);
    expect(onStart).toHaveBeenLastCalledWith(b, "current");
    fireEvent.click(screen.getAllByRole("button", { name: "Exactly as saved" })[0]);
    expect(onStart).toHaveBeenLastCalledWith(a, "as-saved");
  });
});
