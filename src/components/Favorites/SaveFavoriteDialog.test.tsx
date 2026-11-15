import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FAVORITE_NAME_MAX_LENGTH } from "@/lib/favorites";
import { SaveFavoriteDialog } from "./SaveFavoriteDialog";

afterEach(cleanup);

function setup(overrides: Partial<React.ComponentProps<typeof SaveFavoriteDialog>> = {}) {
  const props = { open: true, onOpenChange: vi.fn(), defaultName: "Workout A1", onSave: vi.fn(), ...overrides };
  render(<SaveFavoriteDialog {...props} />);
  return props;
}

describe("SaveFavoriteDialog", () => {
  it("renders nothing when closed", () => {
    setup({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("starts with the default name and limits the length", () => {
    setup();
    const field = screen.getByRole("textbox", { name: "Favourite name" });
    expect(field).toHaveValue("Workout A1");
    expect(field).toHaveAttribute("maxlength", String(FAVORITE_NAME_MAX_LENGTH));
  });

  it("saves the cleaned name", () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Heavy   legs " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("Heavy legs");
  });

  it("disables Save while the name is empty", () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("closes on Cancel without saving", () => {
    const { onOpenChange, onSave } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSave).not.toHaveBeenCalled();
  });
});
