import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const pathname = vi.fn<() => string>();
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));
vi.mock("@/components/BottomNav", () => ({
  default: () => <nav data-testid="bottom-nav" />,
}));

import { AppChrome } from "./AppChrome";

function renderAt(path: string) {
  pathname.mockReturnValue(path);
  return render(
    <AppChrome>
      <p>page</p>
    </AppChrome>
  );
}

describe("AppChrome", () => {
  beforeEach(() => pathname.mockReset());

  it.each(["/", "/history", "/workout/configure", "/workout/summary", "/settings"])(
    "renders the bottom nav and its padding on %s",
    (path) => {
      renderAt(path);
      expect(screen.getByTestId("bottom-nav")).toBeInTheDocument();
      const wrapper = screen.getByText("page").parentElement!;
      expect(wrapper).toHaveClass("min-h-screen", "pb-28");
    }
  );

  it.each(["/workout/active", "/workout/active/", "/workout/active?sessionId=x"])(
    "hides the bottom nav and its padding on %s",
    (path) => {
      renderAt(path);
      expect(screen.queryByTestId("bottom-nav")).not.toBeInTheDocument();
      const wrapper = screen.getByText("page").parentElement!;
      expect(wrapper).toHaveClass("min-h-screen");
      expect(wrapper).not.toHaveClass("pb-28");
    }
  );

  it("treats a missing pathname as a normal route", () => {
    pathname.mockReturnValue(null as unknown as string);
    render(
      <AppChrome>
        <p>page</p>
      </AppChrome>
    );
    expect(screen.getByTestId("bottom-nav")).toBeInTheDocument();
  });
});
