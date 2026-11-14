import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DerivedDiff } from "@/lib/rebuild";

const { checkDerived, applyRebuild } = vi.hoisted(() => ({ checkDerived: vi.fn(), applyRebuild: vi.fn() }));
vi.mock("@/lib/data/derived", () => ({ checkDerived, applyRebuild, loadRebuildInput: vi.fn() }));
vi.mock("@/lib/data/logEdits", () => ({ listDeleted: vi.fn() }));
vi.mock("@/hooks", async () => {
  const mod = await import("@/hooks/useLogEdit");
  return { useDerivedCheck: mod.useDerivedCheck };
});

import { DataIntegrityCard } from "./DataIntegrityCard";

const CONSISTENT: DerivedDiff = {
  liftStatesToPut: [],
  liftStateIdsToDelete: [],
  e1rmsToPut: [],
  e1rmIdsToDelete: [],
  consistent: true,
};
const DIFFERS = {
  ...CONSISTENT,
  liftStatesToPut: [{}],
  e1rmIdsToDelete: ["a", "b"],
  consistent: false,
} as unknown as DerivedDiff;

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("DataIntegrityCard", () => {
  it("reports that weights and history match the log", async () => {
    checkDerived.mockResolvedValue(CONSISTENT);
    render(<DataIntegrityCard />);
    await click("Check derived data");
    expect(screen.getByText("Weights and history match the log.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rebuild from log" })).not.toBeInTheDocument();
  });

  it("reports how many rows differ and rebuilds from the log", async () => {
    checkDerived.mockResolvedValue(DIFFERS);
    applyRebuild.mockResolvedValue(DIFFERS);
    render(<DataIntegrityCard />);
    await click("Check derived data");
    expect(screen.getByText("3 rows differ from the log")).toBeInTheDocument();
    await click("Rebuild from log");
    expect(applyRebuild).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Rebuilt from the log")).toBeInTheDocument();
    expect(screen.getByText("3 rows updated.")).toBeInTheDocument();
  });

  it("shows progress while checking", async () => {
    let finish: (d: DerivedDiff) => void = () => {};
    checkDerived.mockReturnValue(new Promise<DerivedDiff>((r) => (finish = r)));
    render(<DataIntegrityCard />);
    await click("Check derived data");
    expect(screen.getByText("Checking...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check derived data" })).toBeDisabled();
    await act(async () => finish(CONSISTENT));
    expect(screen.queryByText("Checking...")).not.toBeInTheDocument();
  });

  it("shows an error in words", async () => {
    checkDerived.mockRejectedValue(new Error("database closed"));
    render(<DataIntegrityCard />);
    await click("Check derived data");
    expect(screen.getByText("database closed")).toBeInTheDocument();
  });
});
