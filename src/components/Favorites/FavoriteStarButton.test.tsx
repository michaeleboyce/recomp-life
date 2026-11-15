import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FavoriteStarButton } from "./FavoriteStarButton";

afterEach(cleanup);

describe("FavoriteStarButton", () => {
  it("offers to save when inactive", () => {
    render(<FavoriteStarButton active={false} onToggle={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Save as favourite" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button.querySelector("svg")).not.toHaveClass("fill-current");
  });

  it("offers to remove when active, with a filled star", () => {
    render(<FavoriteStarButton active onToggle={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Remove from favourites" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button.querySelector("svg")).toHaveClass("fill-current");
  });

  it("has a 44px tap target", () => {
    render(<FavoriteStarButton active={false} onToggle={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveClass("min-h-11", "min-w-11");
  });

  it("shows an optional visible label", () => {
    render(<FavoriteStarButton active={false} onToggle={vi.fn()} label="Favourite" />);
    expect(screen.getByText("Favourite")).toBeInTheDocument();
  });

  it("toggles and does not let the click reach a clickable parent", () => {
    const onToggle = vi.fn();
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <FavoriteStarButton active={false} onToggle={onToggle} />
      </div>
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
