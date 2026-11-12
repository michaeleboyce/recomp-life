import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ListRow } from "./list-row";

afterEach(cleanup);

describe("ListRow", () => {
  it("renders a div with no chevron by default", () => {
    render(<ListRow title="Squat" subtitle="5x3" />);
    const row = screen.getByText("Squat").closest("[data-slot=list-row]")!;
    expect(row.tagName).toBe("DIV");
    expect(row.querySelector("svg")).toBeNull();
    expect(screen.getByText("5x3")).toBeInTheDocument();
  });

  it("has the 52px minimum height and a hairline divider", () => {
    render(<ListRow title="Squat" />);
    const row = screen.getByText("Squat").closest("[data-slot=list-row]")!;
    expect(row).toHaveClass("min-h-[52px]", "border-b", "border-border", "last:border-b-0");
  });

  it("renders a link with a chevron for href", () => {
    render(<ListRow title="Squat" href="/progress/lift/squat" />);
    const link = screen.getByRole("link", { name: /Squat/ });
    expect(link).toHaveAttribute("href", "/progress/lift/squat");
    expect(link.querySelector("svg")).not.toBeNull();
  });

  it("renders a button for onClick and fires it", () => {
    const onClick = vi.fn();
    render(<ListRow title="Squat" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: /Squat/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("lets showChevron override the default", () => {
    render(<ListRow title="Squat" href="/x" showChevron={false} />);
    expect(screen.getByRole("link").querySelector("svg")).toBeNull();
    cleanup();
    render(<ListRow title="Squat" showChevron />);
    expect(screen.getByText("Squat").closest("[data-slot=list-row]")!.querySelector("svg")).not.toBeNull();
  });

  it("renders leading, value, valueSub and trailing", () => {
    render(
      <ListRow
        title="Squat"
        leading={<i data-testid="lead" />}
        value="300"
        valueSub={<span>+5</span>}
        trailing={<i data-testid="trail" />}
      />
    );
    expect(screen.getByTestId("lead")).toBeInTheDocument();
    expect(screen.getByText("300")).toHaveClass("font-mono");
    expect(screen.getByText("+5")).toBeInTheDocument();
    expect(screen.getByTestId("trail")).toBeInTheDocument();
  });
});
