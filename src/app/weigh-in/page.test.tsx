import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb } from "@/lib/data/testUtils";
import { installNavHistory, resetNavHistoryForTests } from "@/components/nav/navHistory";
import WeighInPage from "./page";

const push = vi.fn();
const back = vi.fn();
let from: string | null = null;
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back }),
  useSearchParams: () => new URLSearchParams(from ? { from } : {}),
}));

describe("WeighInPage", () => {
  beforeEach(async () => {
    push.mockClear();
    back.mockClear();
    from = null;
    resetNavHistoryForTests();
    window.history.replaceState(null, "", "/");
    await clearDb();
  });
  afterEach(() => {
    cleanup();
    resetNavHistoryForTests();
    vi.restoreAllMocks();
  });

  it("saves a new unsynced bodyweight row and returns home", async () => {
    render(<WeighInPage />);
    const input = await screen.findByPlaceholderText("0.0");
    fireEvent.change(input, { target: { value: "181.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Weight" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    const rows = await db.bodyweight.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ weight: 181.5, synced: false });
    expect(rows[0].clientId).toBe(rows[0].id);
  });

  it("shows the latest entry as a hint, not a value, and lists recent entries", async () => {
    await db.bodyweight.add({
      id: "b1",
      clientId: "b1",
      date: new Date("2026-11-01T00:00:00"),
      weight: 190,
      timeOfDay: "morning",
      synced: true,
    });
    render(<WeighInPage />);
    const input = await screen.findByPlaceholderText("190");
    expect(input).toHaveValue(null);
    expect(screen.getByRole("button", { name: "Save Weight" })).toBeDisabled();
    expect(screen.getByText("Last 1 Entries")).toBeInTheDocument();
  });

  it("goes back to a known `from` after saving and ignores an unknown one", async () => {
    from = "body";
    const { unmount } = render(<WeighInPage />);
    fireEvent.change(await screen.findByPlaceholderText("0.0"), { target: { value: "181.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Weight" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/progress?tab=body"));
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/progress?tab=body");
    unmount();

    from = "https://example.com";
    render(<WeighInPage />);
    expect(await screen.findByRole("link", { name: "Back" })).toHaveAttribute("href", "/");
  });

  it("opened from another screen in the app, Back and Save return to it", async () => {
    from = "body";
    act(() => {
      installNavHistory();
      window.history.pushState(null, "", "/progress/forecasts");
      window.history.pushState(null, "", "/weigh-in?from=body");
    });
    const historyBack = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<WeighInPage />);

    // The arrow names the previous screen; its address stays the fixed fallback.
    const arrow = await screen.findByRole("link", { name: "Back to Forecasts" });
    expect(arrow).toHaveAttribute("href", "/progress?tab=body");
    fireEvent.click(arrow);
    expect(historyBack).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByPlaceholderText("0.0"), { target: { value: "181.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Weight" }));
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
    expect(push).not.toHaveBeenCalled();
  });

  it("with no entries the field starts empty and Save is disabled", async () => {
    render(<WeighInPage />);
    const input = await screen.findByPlaceholderText("0.0");
    expect(input).toHaveValue(null);
    expect(screen.getByRole("button", { name: "Save Weight" })).toBeDisabled();
  });
});
