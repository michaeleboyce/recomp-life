import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const initializeDatabase = vi.fn<() => Promise<void>>();
vi.mock("@/db/init", () => ({ initializeDatabase: () => initializeDatabase() }));

import { DbProvider, useDbReady } from "./DbProvider";

function ReadyProbe() {
  return <span data-testid="ready">{String(useDbReady())}</span>;
}

describe("DbProvider", () => {
  beforeEach(() => {
    initializeDatabase.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a skeleton until initialisation resolves, then renders children", async () => {
    let resolve!: () => void;
    initializeDatabase.mockReturnValue(new Promise<void>((r) => (resolve = r)));

    render(
      <DbProvider>
        <p>page content</p>
      </DbProvider>
    );

    expect(screen.queryByText("page content")).not.toBeInTheDocument();
    expect(screen.getByTestId("db-loading")).toBeInTheDocument();

    resolve();
    expect(await screen.findByText("page content")).toBeInTheDocument();
    expect(screen.queryByTestId("db-loading")).not.toBeInTheDocument();
    expect(initializeDatabase).toHaveBeenCalledTimes(1);
  });

  it("exposes readiness through useDbReady", async () => {
    initializeDatabase.mockResolvedValue();
    render(
      <DbProvider>
        <ReadyProbe />
      </DbProvider>
    );
    expect(await screen.findByTestId("ready")).toHaveTextContent("true");
  });

  it("useDbReady is false outside a provider", () => {
    render(<ReadyProbe />);
    expect(screen.getByTestId("ready")).toHaveTextContent("false");
  });

  it("logs a rejected initialisation and still renders children", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    initializeDatabase.mockRejectedValue(new Error("seed failed"));

    render(
      <DbProvider>
        <p>page content</p>
      </DbProvider>
    );

    expect(await screen.findByText("page content")).toBeInTheDocument();
    await waitFor(() => expect(error).toHaveBeenCalled());
  });
});
