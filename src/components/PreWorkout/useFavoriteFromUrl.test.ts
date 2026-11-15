import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { clearDb } from "@/lib/data/testUtils";
import { deleteFavorite, renameFavorite, saveFavoriteFromSetup } from "@/lib/data/favorites";
import { parseFavoriteMode, useFavoriteFromUrl } from "./useFavoriteFromUrl";

beforeEach(clearDb);

const SETUP = {
  templateId: "B1",
  location: "gym" as const,
  includeWarmUps: false,
  selectedAccessories: [],
  substitutes: {},
  edits: [],
  plan: [],
};

describe("parseFavoriteMode", () => {
  it("defaults to today's weights", () => {
    expect(parseFavoriteMode(null)).toBe("current");
    expect(parseFavoriteMode("nonsense")).toBe("current");
    expect(parseFavoriteMode("current")).toBe("current");
    expect(parseFavoriteMode("as-saved")).toBe("as-saved");
  });
});

describe("useFavoriteFromUrl", () => {
  it("is 'none' without a favourite id", () => {
    const { result } = renderHook(() => useFavoriteFromUrl(null, null));
    expect(result.current).toEqual({ status: "none" });
  });

  it("is loading until the list arrives, then resolves the favourite for its mode", async () => {
    const id = await saveFavoriteFromSetup("Press day", SETUP);
    const { result } = renderHook(() => useFavoriteFromUrl(id, "as-saved"));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("applied"));
    expect(result.current).toMatchObject({
      status: "applied",
      name: "Press day",
      mode: "as-saved",
      resolved: { favoriteId: id, templateId: "B1" },
    });
  });

  it("is 'missing' for an unknown or deleted favourite", async () => {
    const gone = await saveFavoriteFromSetup("Gone", SETUP);
    await deleteFavorite(gone);
    const unknown = renderHook(() => useFavoriteFromUrl("nope", null));
    const deleted = renderHook(() => useFavoriteFromUrl(gone, null));
    await waitFor(() => expect(unknown.result.current.status).toBe("missing"));
    await waitFor(() => expect(deleted.result.current.status).toBe("missing"));
  });

  it("keeps the same resolved object when the list changes underneath it", async () => {
    const id = await saveFavoriteFromSetup("Before", SETUP);
    const { result } = renderHook(() => useFavoriteFromUrl(id, null));
    await waitFor(() => expect(result.current.status).toBe("applied"));
    const first = result.current;

    await act(async () => {
      await renameFavorite(id, "After");
      await deleteFavorite(id);
    });
    // Let the live queries re-run.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(result.current).toBe(first);
  });

  it("resolves again when the mode changes", async () => {
    const id = await saveFavoriteFromSetup("Both", SETUP);
    const { result, rerender } = renderHook(({ mode }) => useFavoriteFromUrl(id, mode), {
      initialProps: { mode: "current" as string },
    });
    await waitFor(() => expect(result.current.status).toBe("applied"));
    rerender({ mode: "as-saved" });
    expect(result.current).toMatchObject({ status: "applied", mode: "as-saved" });
  });
});
