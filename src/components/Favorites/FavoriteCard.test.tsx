import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FAVORITE_NAME_MAX_LENGTH } from "@/lib/favorites";
import { FavoriteCard } from "./FavoriteCard";
import { makeFavorite } from "./testFavorites";

afterEach(cleanup);

const NOW = new Date(2026, 10, 12, 10, 0, 0);
const favorite = makeFavorite("f1", "Heavy legs", { lastUsedAt: new Date(2026, 10, 11, 9) });

describe("FavoriteCard", () => {
  it("shows the name, day, location, exercises and last used", () => {
    render(<FavoriteCard favorite={favorite} now={NOW} onStart={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Heavy legs" })).toBeInTheDocument();
    expect(screen.getByText(/A1 · Squat day/)).toBeInTheDocument();
    expect(screen.getByText(/Gym/)).toBeInTheDocument();
    expect(screen.getByText("Barbell Squat")).toBeInTheDocument();
    expect(document.querySelector("[data-slot=tier-badge][data-tier=T1]")).not.toBeNull();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
  });

  it("starts with today's weights or exactly as saved", () => {
    const onStart = vi.fn();
    render(<FavoriteCard favorite={favorite} now={NOW} onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: "Today's weights" }));
    expect(onStart).toHaveBeenLastCalledWith("current");
    fireEvent.click(screen.getByRole("button", { name: "Exactly as saved" }));
    expect(onStart).toHaveBeenLastCalledWith("as-saved");
  });

  it("explains each start button", () => {
    render(<FavoriteCard favorite={favorite} now={NOW} onStart={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Today's weights" })).toHaveAccessibleDescription(
      "Same exercises at your current program weights"
    );
    expect(screen.getByRole("button", { name: "Exactly as saved" })).toHaveAccessibleDescription(
      "Same sets, reps and weights as when you saved it"
    );
  });

  it("hides rename and delete without their callbacks", () => {
    render(<FavoriteCard favorite={favorite} now={NOW} onStart={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("renames inline with a cleaned name", () => {
    const onRename = vi.fn();
    render(<FavoriteCard favorite={favorite} now={NOW} onStart={vi.fn()} onRename={onRename} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(screen.queryByRole("heading", { name: "Heavy legs" })).toBeNull();
    const field = screen.getByRole("textbox", { name: "Favourite name" });
    expect(field).toHaveValue("Heavy legs");
    expect(field).toHaveAttribute("maxlength", String(FAVORITE_NAME_MAX_LENGTH));
    fireEvent.change(field, { target: { value: "  Leg   day  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onRename).toHaveBeenCalledWith("Leg day");
    expect(screen.getByRole("heading", { name: "Heavy legs" })).toBeInTheDocument();
  });

  it("cancels a rename without saving, and cannot save an empty name", () => {
    const onRename = vi.fn();
    render(<FavoriteCard favorite={favorite} now={NOW} onStart={vi.fn()} onRename={onRename} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Favourite name" }), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Heavy legs" })).toBeInTheDocument();
    // Re-opening starts from the saved name again.
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(screen.getByRole("textbox", { name: "Favourite name" })).toHaveValue("Heavy legs");
  });

  it("asks for confirmation before deleting", () => {
    const onDelete = vi.fn();
    render(<FavoriteCard favorite={favorite} now={NOW} onStart={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText("Delete favourite?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText("Delete favourite?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
