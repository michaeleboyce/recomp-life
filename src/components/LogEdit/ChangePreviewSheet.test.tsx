import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChangePreviewSheet } from "./ChangePreviewSheet";
import { NEXT_CHANGES, UNAFFECTED } from "./testFixtures";

afterEach(cleanup);

function show(preview = NEXT_CHANGES, extra: Partial<Parameters<typeof ChangePreviewSheet>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(<ChangePreviewSheet open preview={preview} onConfirm={onConfirm} onCancel={onCancel} {...extra} />);
  return { onConfirm, onCancel };
}

describe("ChangePreviewSheet", () => {
  it("is titled and lists a next-workout change in plain words with an accessible arrow", () => {
    show();
    expect(screen.getByRole("dialog", { name: "What this changes" })).toBeInTheDocument();
    const item = screen.getByText(/Squat T1 next time/).closest("li")!;
    expect(item).toHaveTextContent("Squat T1 next time: 205 lbs 5x3 changes to 200 lbs 6x2");
    expect(item.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("lists a PR change and the count of other history updates", () => {
    show();
    expect(screen.getByText(/best estimated 1RM/).closest("li")).toHaveTextContent(
      "Bench Press best estimated 1RM: 215 changes to 210"
    );
    expect(screen.getByText("3 estimated 1RM entries in your history are updated")).toBeInTheDocument();
  });

  it("says Nothing else changes when the change is unaffected", () => {
    show(UNAFFECTED);
    expect(screen.getByText("Nothing else changes")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("Save change confirms and Cancel cancels", () => {
    const { onConfirm, onCancel } = show();
    fireEvent.click(screen.getByRole("button", { name: "Save change" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("takes a custom confirm label and shows an error", () => {
    show(NEXT_CHANGES, { confirmLabel: "Delete workout", error: "quota exceeded" });
    expect(screen.getByRole("button", { name: "Delete workout" })).toBeInTheDocument();
    expect(screen.getByText("quota exceeded")).toBeInTheDocument();
  });
});
