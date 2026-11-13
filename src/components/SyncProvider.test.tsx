import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { SyncProvider } from "./SyncProvider";

const sync = vi.hoisted(() => ({
  fullSync: vi.fn(),
  pushUnsynced: vi.fn(),
  checkConnectivity: vi.fn(),
  getSyncKey: vi.fn(),
}));

vi.mock("@/lib/sync", () => ({
  fullSync: sync.fullSync,
  pushUnsynced: sync.pushUnsynced,
  checkConnectivity: sync.checkConnectivity,
  SYNC_UNAUTHORIZED: "Sync passphrase missing or rejected",
}));
vi.mock("@/lib/syncKey", () => ({ getSyncKey: sync.getSyncKey }));

const ok = { pushed: 0, pulled: 0, errors: [] as string[], pullSucceeded: true };

beforeEach(() => {
  vi.clearAllMocks();
  sync.getSyncKey.mockReturnValue("passphrase");
  sync.checkConnectivity.mockResolvedValue(true);
  sync.fullSync.mockResolvedValue(ok);
  sync.pushUnsynced.mockResolvedValue(0);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SyncProvider", () => {
  it("renders nothing and does not sync without a passphrase", async () => {
    sync.getSyncKey.mockReturnValue(null);
    const { container } = render(<SyncProvider />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
    expect(sync.checkConnectivity).not.toHaveBeenCalled();
    expect(sync.fullSync).not.toHaveBeenCalled();
  });

  it("does not sync when offline", async () => {
    sync.checkConnectivity.mockResolvedValue(false);
    const { container } = render(<SyncProvider />);
    await waitFor(() => expect(sync.checkConnectivity).toHaveBeenCalled());
    await act(async () => {});
    expect(sync.fullSync).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("syncs on mount: shows Syncing, then Synced, then clears after 3 seconds", async () => {
    vi.useFakeTimers();
    let finish: (value: typeof ok) => void = () => {};
    sync.fullSync.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    const { container } = render(<SyncProvider />);
    await act(async () => {});
    expect(screen.getByText("Syncing...")).toBeInTheDocument();
    expect(sync.fullSync).toHaveBeenCalledTimes(1);

    await act(async () => finish(ok));
    expect(screen.getByText("Synced")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("reports a failed sync and a rejected passphrase differently", async () => {
    sync.fullSync.mockResolvedValue({ ...ok, errors: ["Pull: Pull failed: 500"] });
    render(<SyncProvider />);
    expect(await screen.findByText("Sync failed")).toBeInTheDocument();
    cleanup();

    sync.fullSync.mockResolvedValue({
      ...ok,
      errors: ["Push: Sync passphrase missing or rejected"],
    });
    render(<SyncProvider />);
    expect(await screen.findByText("Sync passphrase rejected")).toBeInTheDocument();
  });

  it("syncs again when back online or when the passphrase changes", async () => {
    render(<SyncProvider />);
    await waitFor(() => expect(sync.fullSync).toHaveBeenCalledTimes(1));

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(sync.fullSync).toHaveBeenCalledTimes(2));

    await act(async () => {
      window.dispatchEvent(new Event("recomp-sync-key-changed"));
    });
    await waitFor(() => expect(sync.fullSync).toHaveBeenCalledTimes(3));
  });

  it("pushes only, quietly, when the app returns to the foreground", async () => {
    sync.pushUnsynced.mockRejectedValue(new Error("offline"));
    render(<SyncProvider />);
    await waitFor(() => expect(sync.fullSync).toHaveBeenCalledTimes(1));

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(sync.pushUnsynced).toHaveBeenCalledTimes(1));
    expect(sync.fullSync).toHaveBeenCalledTimes(1);
  });

  it("runs a full sync on returning to the foreground when the last pull is over 5 minutes old", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    render(<SyncProvider />);
    await waitFor(() => expect(sync.fullSync).toHaveBeenCalledTimes(1));
    await act(async () => {});

    now.mockReturnValue(1_000_000 + 5 * 60 * 1000);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(sync.pushUnsynced).toHaveBeenCalledTimes(1));
    expect(sync.fullSync).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + 5 * 60 * 1000 + 1);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(sync.fullSync).toHaveBeenCalledTimes(2));
    expect(sync.pushUnsynced).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });

  it("runs a full sync on returning to the foreground when no pull has completed yet", async () => {
    sync.fullSync.mockResolvedValue({ ...ok, errors: ["Pull: Pull failed: 500"], pullSucceeded: false });
    render(<SyncProvider />);
    await waitFor(() => expect(sync.fullSync).toHaveBeenCalledTimes(1));
    await act(async () => {});

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(sync.fullSync).toHaveBeenCalledTimes(2));
    expect(sync.pushUnsynced).not.toHaveBeenCalled();
  });

  it("does nothing when the page becomes hidden", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(<SyncProvider />);
    await waitFor(() => expect(sync.fullSync).toHaveBeenCalledTimes(1));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(sync.fullSync).toHaveBeenCalledTimes(1);
    expect(sync.pushUnsynced).not.toHaveBeenCalled();
    visibility.mockRestore();
  });

  it("stops listening after unmount", async () => {
    const { unmount } = render(<SyncProvider />);
    await waitFor(() => expect(sync.fullSync).toHaveBeenCalledTimes(1));
    unmount();
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => {});
    expect(sync.fullSync).toHaveBeenCalledTimes(1);
    expect(sync.pushUnsynced).not.toHaveBeenCalled();
  });
});
