import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Callout } from "./callout";

describe("Callout", () => {
  it("defaults to info with role status and a default icon", () => {
    const { container } = render(<Callout>Body text</Callout>);
    const el = screen.getByRole("status");
    expect(el).toHaveAttribute("data-variant", "info");
    expect(el).toHaveClass("bg-info-soft");
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.getByText("Body text")).toHaveClass("text-muted-foreground");
  });

  it("uses role status for success and role alert for warning and danger", () => {
    const { rerender } = render(<Callout variant="success">ok</Callout>);
    expect(screen.getByRole("status")).toHaveClass("bg-success-soft");
    rerender(<Callout variant="warning">careful</Callout>);
    expect(screen.getByRole("alert")).toHaveClass("bg-warning-soft");
    rerender(<Callout variant="danger">stop</Callout>);
    expect(screen.getByRole("alert")).toHaveClass("bg-destructive-soft");
  });

  it("renders the title in the variant colour", () => {
    render(
      <Callout variant="warning" title="Heads up">
        x
      </Callout>
    );
    expect(screen.getByText("Heads up")).toHaveClass("font-semibold", "text-warning");
  });

  it("hides the icon when icon is null and accepts a custom icon", () => {
    const { container, rerender } = render(<Callout icon={null}>x</Callout>);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
    rerender(<Callout icon={<span data-testid="custom" />}>x</Callout>);
    expect(screen.getByTestId("custom")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("renders actions in a wrapping row", () => {
    render(<Callout actions={<button>Resume</button>}>x</Callout>);
    const row = screen.getByRole("button", { name: "Resume" }).parentElement!;
    expect(row).toHaveClass("flex", "flex-wrap", "gap-2");
  });

  it("passes className through", () => {
    render(<Callout className="mt-4">x</Callout>);
    expect(screen.getByRole("status")).toHaveClass("mt-4");
  });
});
