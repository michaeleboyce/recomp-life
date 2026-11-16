import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { YourCall, formatChance, overrideExplanation } from "./YourCall";

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

afterEach(cleanup);

const alternatives = [
  { label: "easier", value: 210 },
  { label: "the plan", value: 215 },
  { label: "harder", value: 220 },
];

function renderCall(chances?: Map<number, number>) {
  return render(
    <YourCall
      alternatives={alternatives}
      planned={215}
      liftName="Deadlift"
      chances={chances}
      editHref="/workout/configure"
      noChanceReason="No new-best forecast for this lift."
    />
  );
}

describe("YourCall", () => {
  it("shows the chance of a new best for each weight that has one", () => {
    renderCall(new Map([[210, 0.74], [215, 0.58]]));
    expect(screen.getByRole("button", { name: /210 pounds, lighter, 74% chance/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /215 pounds, the plan, 58% chance/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "220 pounds, heavier" })).toBeInTheDocument();
    expect(screen.getByText(/chance of a new best/i)).toBeInTheDocument();
  });

  it("changes nothing on a tap: it explains the choice and links to the Ready screen", () => {
    renderCall(new Map());
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /220 pounds, heavier/ }));
    expect(screen.getByText(/deadlift progresses from what you lift/)).toBeInTheDocument();
    // Changed before START, the workout's forecasts are made at the new weight.
    expect(screen.getByText("Changed before you start, the forecast is made for 220.")).toBeInTheDocument();
    expect(screen.queryByText(/set aside/)).toBeNull();
    expect(screen.getByRole("link", { name: "Change it on the Ready screen" })).toHaveAttribute(
      "href",
      "/workout/configure"
    );
    fireEvent.click(screen.getByRole("button", { name: /210 pounds, lighter/ }));
    expect(screen.getByText(/logged but do not count toward progression/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /215 pounds, the plan/ }));
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("says why there is no chance when no weight has one", () => {
    renderCall(new Map());
    expect(screen.getByText(/No new-best forecast for this lift/)).toBeInTheDocument();
  });

  it("formats chances and explanations", () => {
    expect(formatChance(0.583)).toBe("58%");
    expect(formatChance(0.001)).toBe("under 1%");
    expect(formatChance(0.999)).toBe("over 99%");
    expect(overrideExplanation(220, 215, "Squat")).toMatch(/^Lifting 220 instead of 215: the app records/);
    expect(overrideExplanation(210, 215, "Squat")).toMatch(/squat stays at 215 for next time/);
  });
});
