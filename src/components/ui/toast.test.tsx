import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Toaster, dismissToast, toast } from "./toast";

const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    act(() => dismissToast());
    cleanup();
    vi.useRealTimers();
  });

  it("renders nothing until a toast is shown", () => {
    render(<Toaster />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the message in a polite status region", () => {
    render(<Toaster />);
    act(() => toast({ message: "Run deleted" }));
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("Run deleted");
  });

  it("auto-dismisses after the default 6000 ms", () => {
    render(<Toaster />);
    act(() => toast({ message: "Hi" }));
    tick(5999);
    expect(screen.getByText("Hi")).toBeInTheDocument();
    tick(1);
    expect(screen.queryByText("Hi")).not.toBeInTheDocument();
  });

  it("honours a custom duration", () => {
    render(<Toaster />);
    act(() => toast({ message: "Hi", durationMs: 1000 }));
    tick(1000);
    expect(screen.queryByText("Hi")).not.toBeInTheDocument();
  });

  it("calls onAction once and dismisses; a second click does nothing", () => {
    const onAction = vi.fn();
    render(<Toaster />);
    act(() => toast({ message: "Deleted", action: { label: "Undo", onAction } }));
    const button = screen.getByRole("button", { name: "Undo" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Deleted")).not.toBeInTheDocument();
  });

  it("replaces the current toast and restarts the timer", () => {
    render(<Toaster />);
    act(() => toast({ message: "First" }));
    tick(4000);
    act(() => toast({ message: "Second" }));
    expect(screen.queryByText("First")).not.toBeInTheDocument();
    tick(4000);
    expect(screen.getByText("Second")).toBeInTheDocument();
    tick(2000);
    expect(screen.queryByText("Second")).not.toBeInTheDocument();
  });

  it("dismiss button closes the toast", () => {
    render(<Toaster />);
    act(() => toast({ message: "Bye" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Bye")).not.toBeInTheDocument();
  });

  it("pauses while hovered and resumes on leave", () => {
    render(<Toaster />);
    act(() => toast({ message: "Hold" }));
    const region = screen.getByRole("status");
    tick(3000);
    fireEvent.mouseEnter(region);
    tick(20000);
    expect(screen.getByText("Hold")).toBeInTheDocument();
    fireEvent.mouseLeave(region);
    tick(2999);
    expect(screen.getByText("Hold")).toBeInTheDocument();
    tick(1);
    expect(screen.queryByText("Hold")).not.toBeInTheDocument();
  });

  it("pauses while focus is inside and resumes on blur", () => {
    render(<Toaster />);
    act(() => toast({ message: "Focus", action: { label: "Undo", onAction: () => {} } }));
    const button = screen.getByRole("button", { name: "Undo" });
    fireEvent.focus(button);
    tick(20000);
    expect(screen.getByText("Focus")).toBeInTheDocument();
    fireEvent.blur(button);
    tick(6000);
    expect(screen.queryByText("Focus")).not.toBeInTheDocument();
  });
});
