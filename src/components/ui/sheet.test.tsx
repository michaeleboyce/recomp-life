import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./sheet";
import { shouldDismiss } from "./sheet-drag";

const SHEET_HEIGHT = 400;
let clock = 0;

function renderSheet(side: "bottom" | "right" | "top" | "left" = "bottom", body?: React.ReactNode) {
  const onOpenChange = vi.fn();
  render(
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>Why this weight</SheetTitle>
          <SheetDescription>Three checks</SheetDescription>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  );
  return { onOpenChange, content: screen.getByRole("dialog") };
}

/** A press at y=100, moves to each y in turn (`stepMs` apart), and a release. */
function drag(target: Element, ys: number[], stepMs = 200) {
  clock = 0;
  fireEvent.pointerDown(target, { pointerId: 1, clientX: 200, clientY: 100 });
  for (const y of ys) {
    clock += stepMs;
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 200, clientY: y });
  }
  clock += stepMs;
  fireEvent.pointerUp(target, { pointerId: 1, clientX: 200, clientY: ys.at(-1) ?? 100 });
}

beforeEach(() => {
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    height: SHEET_HEIGHT,
    width: 390,
    top: 444,
    left: 0,
    right: 390,
    bottom: 844,
    x: 0,
    y: 444,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the bottom sheet's grab handle", () => {
  it("renders on bottom sheets only", () => {
    renderSheet("bottom");
    const handle = screen.getByRole("button", { name: "Drag down to close" });
    // Out of the tab order, so the sheet's first focus does not land on it.
    expect(handle).toHaveAttribute("tabindex", "-1");
    expect(handle).toHaveClass("h-11");
    cleanup();

    for (const side of ["right", "left", "top"] as const) {
      renderSheet(side);
      expect(screen.queryByRole("button", { name: "Drag down to close" })).toBeNull();
      cleanup();
    }
  });

  it("keeps the close button and Escape", () => {
    const { onOpenChange } = renderSheet();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes the sheet when dragged down past a quarter of its height", async () => {
    const { onOpenChange, content } = renderSheet();
    const handle = screen.getByRole("button", { name: "Drag down to close" });
    drag(handle, [130, 180, 220]);
    // The sheet followed the finger.
    expect(content.style.transform).toBe("translateY(120px)");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("springs back after a short drag", async () => {
    const { onOpenChange, content } = renderSheet();
    drag(screen.getByRole("button", { name: "Drag down to close" }), [120, 140]);
    expect(content.style.transform).toBe("");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("closes on a quick flick down, even a short one", async () => {
    const { onOpenChange } = renderSheet();
    drag(screen.getByRole("button", { name: "Drag down to close" }), [115, 135], 10);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("moves the sheet from its header too", async () => {
    const { onOpenChange } = renderSheet();
    drag(screen.getByText("Why this weight"), [150, 250]);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("lets scrolled content scroll instead of moving the sheet", async () => {
    const { onOpenChange, content } = renderSheet(
      "bottom",
      <div data-testid="scroller" style={{ overflowY: "auto" }}>
        <p>Step one</p>
      </div>
    );
    const scroller = screen.getByTestId("scroller");
    scroller.scrollTop = 80;
    drag(screen.getByText("Step one"), [150, 250]);
    expect(content.style.transform).toBe("");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onOpenChange).not.toHaveBeenCalled();

    // At the top, the same drag moves the sheet.
    scroller.scrollTop = 0;
    drag(screen.getByText("Step one"), [150, 250]);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("an upward drag is left to scrolling", () => {
    const { content } = renderSheet();
    drag(screen.getByText("Why this weight"), [80, 40]);
    expect(content.style.transform).toBe("");
  });

  it("a tap on the handle closes the sheet", () => {
    const { onOpenChange } = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Drag down to close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not drag a right-hand sheet", () => {
    const { content } = renderSheet("right");
    drag(screen.getByText("Why this weight"), [150, 250]);
    expect(content.style.transform).toBe("");
  });
});

describe("shouldDismiss", () => {
  it("closes past a quarter of the height, with a floor for short sheets", () => {
    expect(shouldDismiss(100, 400, 0)).toBe(true);
    expect(shouldDismiss(99, 400, 0)).toBe(false);
    expect(shouldDismiss(47, 100, 0)).toBe(false);
    expect(shouldDismiss(48, 100, 0)).toBe(true);
  });

  it("closes on a flick and not when the finger turns back up", () => {
    expect(shouldDismiss(25, 400, 0.8)).toBe(true);
    expect(shouldDismiss(10, 400, 0.8)).toBe(false);
    expect(shouldDismiss(200, 400, -0.8)).toBe(false);
  });
});
