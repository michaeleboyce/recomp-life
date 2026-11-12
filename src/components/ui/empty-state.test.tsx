import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EmptyState } from "./empty-state";

afterEach(cleanup);

describe("EmptyState", () => {
  it("renders only a title", () => {
    render(<EmptyState title="Nothing yet" />);
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
  });

  it("renders icon, body and action", () => {
    render(
      <EmptyState
        icon={<svg data-testid="icon" />}
        title="No runs"
        body="Log your first run."
        action={<button>Log run</button>}
        className="py-4"
      />
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText("Log your first run.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log run" })).toBeInTheDocument();
    expect(screen.getByText("No runs").closest("[data-slot=empty-state]")).toHaveClass(
      "text-center",
      "py-4"
    );
  });
});
