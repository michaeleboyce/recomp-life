import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ErrorPage from "./error";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the app's error screen", () => {
  it("says what happened in plain words, without the error's own text", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorPage error={new Error("TypeError: x is undefined")} reset={() => {}} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Something went wrong");
    expect(screen.getByText(/Your workouts are saved on this device/)).toBeInTheDocument();
    expect(screen.queryByText(/TypeError/)).toBeNull();
  });

  it("tries again with the reset it is given", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    render(<ErrorPage error={new Error("boom")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("still offers a way to start a workout", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorPage error={new Error("boom")} reset={() => {}} />);
    expect(screen.getByRole("link", { name: "Start a workout" })).toHaveAttribute(
      "href",
      "/workout/configure"
    );
  });

  it("logs the error once for whoever is debugging", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("boom");
    const { rerender } = render(<ErrorPage error={failure} reset={() => {}} />);
    rerender(<ErrorPage error={failure} reset={() => {}} />);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.any(String), failure);
  });
});
