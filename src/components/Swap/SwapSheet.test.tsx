// The swap sheet (X1): ranked rows with what each is done at, the score parts on tap,
// one pick by default (just today), "Every time" writing a preference, and two picks
// giving one `swap` and one `add`. Made-up data only.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { seedLiftStates } from "@/lib/workout/testFixtures";
import { getExercise } from "@/lib/exercises";
import { recommendSwaps, swapEdits, swapProgressionEffect, type SwapCandidate, type SwapContext } from "@/lib/swap";
import { SwapSheet } from "./SwapSheet";
import { partsTotal } from "./swapSheetModel";

const setExercisePreference = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
vi.mock("@/lib/data/records", () => ({ setExercisePreference: (...args: unknown[]) => setExercisePreference(...args) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const NOW = new Date(2026, 10, 18, 9, 0, 0);
const CONTEXT: SwapContext = {
  location: "gym",
  equipment: DEFAULT_USER_PROFILE.settings.equipment,
  slot: { tier: "T2", sets: 3, reps: 10, isAMRAP: true, weight: 135 },
  exclude: ["squat", "lat_pulldown"],
  now: NOW,
};
const RANKED = recommendSwaps("bench", CONTEXT);
const nameOf = (c: SwapCandidate) => getExercise(c.exerciseId).name;

beforeEach(() => setExercisePreference.mockClear());
afterEach(cleanup);

function open(props: Partial<Parameters<typeof SwapSheet>[0]> = {}) {
  const onConfirm = vi.fn<(picks: SwapCandidate[]) => Promise<void>>(async () => {});
  const onOpenChange = vi.fn();
  render(
    <SwapSheet open onOpenChange={onOpenChange} exerciseId="bench" tier="T2" context={CONTEXT} onConfirm={onConfirm} {...props} />
  );
  const sheet = screen.getByRole("dialog", { name: "Swap Barbell Bench Press" });
  return { sheet, onConfirm, onOpenChange };
}

describe("the swap sheet", () => {
  it("lists the best candidates with what each is done at, its reason and history", () => {
    const { sheet } = open();
    const recommended = within(sheet).getByRole("region", { name: "Recommended" });
    const rows = within(recommended).getAllByTestId("swap-candidate");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText(nameOf(RANKED[0]))).toBeInTheDocument();
    expect(within(rows[0]).getByTestId("swap-prescription").textContent).toMatch(/× 3 × 10\+$/);
    expect(within(rows[0]).getByText(RANKED[0].reason)).toBeInTheDocument();
    expect(within(rows[0]).getByTestId("swap-history")).toHaveTextContent("Not done before");
    // The rest are under All exercises, collapsed.
    const all = within(sheet).getByRole("button", { name: /All exercises/ });
    expect(all).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(all);
    expect(within(within(sheet).getByRole("region", { name: "All exercises" })).getAllByTestId("swap-candidate")).toHaveLength(
      RANKED.length - 3
    );
  });

  it("shows the score parts on tap, adding up to the score", () => {
    const { sheet } = open();
    const top = RANKED[0];
    fireEvent.click(within(sheet).getByRole("button", { name: `Why ${nameOf(top)}: score ${top.score}` }));
    const breakdown = within(sheet).getByRole("list", { name: `${nameOf(top)} score` });
    const parts = within(breakdown).getAllByTestId("swap-part");
    expect(parts).toHaveLength(top.parts.length);
    top.parts.forEach((part, i) => {
      expect(parts[i]).toHaveTextContent(part.label);
      expect(parts[i]).toHaveTextContent(part.detail);
    });
    expect(within(sheet).getByTestId("swap-total")).toHaveTextContent(String(top.score));
    expect(partsTotal(top)).toBe(top.score);
  });

  it("applies the top pick to today only by default: one tap plus confirm, no preference written", async () => {
    const { sheet, onConfirm, onOpenChange } = open();
    const everyTime = within(sheet).getByRole("switch");
    expect(everyTime).not.toBeChecked();
    fireEvent.click(within(sheet).getByRole("button", { name: `Pick ${nameOf(RANKED[0])}` }));
    expect(within(sheet).getByTestId("swap-effect")).toHaveTextContent(
      swapProgressionEffect("T2", "bench", RANKED[0].exerciseId).text
    );
    fireEvent.click(within(sheet).getByRole("button", { name: `Swap in ${nameOf(RANKED[0])}` }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].map((c) => c.exerciseId)).toEqual([RANKED[0].exerciseId]);
    expect(setExercisePreference).not.toHaveBeenCalled();
  });

  it("with Every time on, also marks the pick preferred at this location, and says what it does", async () => {
    const { sheet, onOpenChange } = open();
    const pick = RANKED[0];
    fireEvent.click(within(sheet).getByRole("button", { name: `Pick ${nameOf(pick)}` }));
    const everyTime = within(sheet).getByRole("switch", { name: "Suggest first every time at the gym" });
    fireEvent.click(everyTime);
    expect(within(sheet).getByTestId("every-time-detail")).toHaveTextContent(/program keeps Barbell Bench Press/);
    fireEvent.click(within(sheet).getByRole("button", { name: `Swap in ${nameOf(pick)}` }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(setExercisePreference).toHaveBeenCalledWith("gym", pick.exerciseId, "preferred");
  });

  it("starts with Every time off each time it opens", () => {
    const first = open();
    fireEvent.click(within(first.sheet).getByRole("switch"));
    expect(within(first.sheet).getByRole("switch")).toBeChecked();
    cleanup();
    const again = open();
    expect(within(again.sheet).getByRole("switch")).not.toBeChecked();
  });

  it("for an accessory, Every time leaves the original out at this location and prefers the pick", async () => {
    const context: SwapContext = { ...CONTEXT, slot: undefined, exclude: [] };
    const onConfirm = vi.fn(async () => {});
    const onOpenChange = vi.fn();
    render(
      <SwapSheet open onOpenChange={onOpenChange} exerciseId="face_pulls" tier="accessory" context={context} onConfirm={onConfirm} />
    );
    const sheet = screen.getByRole("dialog");
    const pick = recommendSwaps("face_pulls", context)[0];
    fireEvent.click(within(sheet).getByRole("button", { name: `Pick ${nameOf(pick)}` }));
    fireEvent.click(within(sheet).getByRole("switch", { name: "Every time at the gym" }));
    fireEvent.click(within(sheet).getByRole("button", { name: `Swap in ${nameOf(pick)}` }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(setExercisePreference.mock.calls).toEqual([
      ["gym", "face_pulls", "blocked"],
      ["gym", pick.exerciseId, "preferred"],
    ]);
  });

  it("picks two in 'Pick more than one': one swap and one add", async () => {
    const { sheet, onConfirm } = open();
    fireEvent.click(within(sheet).getByRole("button", { name: "Pick more than one" }));
    fireEvent.click(within(sheet).getByRole("button", { name: `Pick ${nameOf(RANKED[1])}` }));
    fireEvent.click(within(sheet).getByRole("button", { name: `Pick ${nameOf(RANKED[0])}` }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Swap in 2 exercises" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    const picks = onConfirm.mock.calls[0][0];
    expect(picks.map((c) => c.exerciseId)).toEqual([RANKED[1].exerciseId, RANKED[0].exerciseId]);
    const edits = swapEdits("bench", "T2", picks);
    expect(edits.filter((e) => e.kind === "swap")).toHaveLength(1);
    expect(edits.filter((e) => e.kind === "add")).toHaveLength(1);
  });

  it("offers pairs that cover it together, each saying what it covers", () => {
    const { sheet } = open();
    fireEvent.click(within(sheet).getByRole("button", { name: "Pick more than one" }));
    const together = within(sheet).getByRole("region", { name: "Covers it together" });
    const pair = within(together).getAllByRole("button")[0];
    expect(pair.textContent).toMatch(/Covers/);
    fireEvent.click(pair);
    expect(within(sheet).getByRole("button", { name: "Swap in 2 exercises" })).toBeEnabled();
  });

  it("at home before a workout, tags the lift's home versions and says they count; not during one", () => {
    const home: SwapContext = {
      ...CONTEXT,
      location: "home",
      exclude: ["db_bench"],
      liftState: seedLiftStates().find((s) => s.exerciseId === "bench")!,
      variantStates: [],
    };
    const first = open({ context: home });
    const row = within(first.sheet)
      .getAllByTestId("swap-candidate")
      .find((r) => within(r).queryByRole("button", { name: "Pick DB Floor Press" }))!;
    expect(within(row).getByTestId("swap-counts")).toHaveTextContent("Counts as bench press");
    fireEvent.click(within(row).getByRole("button", { name: "Pick DB Floor Press" }));
    expect(within(first.sheet).getByTestId("swap-effect")).toHaveTextContent(/^Counts as Bench press/);
    cleanup();

    const during = open({ context: { ...home, inWorkout: true }, inWorkout: true });
    expect(within(during.sheet).queryByTestId("swap-counts")).toBeNull();
    fireEvent.click(within(during.sheet).getByRole("button", { name: "Pick DB Floor Press" }));
    expect(within(during.sheet).getByTestId("swap-effect")).toHaveTextContent(/stays at its T2 weight and stage/);
  });

  it("keeps the sheet open with the message when the swap is refused", async () => {
    const onConfirm = vi.fn(async () => {
      throw new Error("That exercise is already finished.");
    });
    const { sheet, onOpenChange } = open({ onConfirm });
    fireEvent.click(within(sheet).getByRole("button", { name: `Pick ${nameOf(RANKED[0])}` }));
    fireEvent.click(within(sheet).getByRole("button", { name: `Swap in ${nameOf(RANKED[0])}` }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("That exercise is already finished.");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("says what is kept when sets are logged, and hides the library link during a workout", () => {
    const { sheet } = open({ inWorkout: true, setsLogged: 2 });
    expect(within(sheet).getByText("2 sets are done. For this workout only.")).toBeInTheDocument();
    expect(within(sheet).getByTestId("swap-effect")).toHaveTextContent(/2 sets of Barbell Bench Press already done are kept/);
    expect(sheet.querySelector("[data-evidence='swap-recommendation']")).not.toBeNull();
  });
});
