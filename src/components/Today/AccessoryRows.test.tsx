import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { AccessoryRows, CHANGE_ACCESSORIES_HREF } from "./AccessoryRows";
import type { AccessoryRowView } from "./accessoryRowModel";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const view = (exerciseId: string, name: string, over: Partial<AccessoryRowView> = {}): AccessoryRowView => ({
  exerciseId,
  name,
  weight: 30,
  perHand: false,
  bodyweight: false,
  sets: 3,
  reps: { min: 12, max: 15 },
  reason: "You usually do this on squat days",
  explained: true,
  ...over,
});

const THREE = [
  view("bicep_curls", "Bicep curls"),
  view("lateral_raises", "Standing lateral raises", { weight: 15, perHand: true, reps: { min: 15, max: 20 } }),
  view("hack_squat", "Hack squat", { weight: null, reason: "Quads are 4 sets short this week" }),
];

describe("AccessoryRows", () => {
  it("folds several into one summary row that expands, with Change beside it", () => {
    render(<AccessoryRows views={THREE} collapsible why changeHref={CHANGE_ACCESSORIES_HREF} />);
    expect(screen.getByTestId("accessory-summary")).toHaveTextContent(
      "3 accessories · bicep curls, standing lateral raises, hack squat"
    );
    expect(screen.queryAllByTestId("accessory-row")).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Change accessories" })).toHaveAttribute("href", CHANGE_ACCESSORIES_HREF);

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const rows = screen.getAllByTestId("accessory-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Bicep curls");
    expect(rows[0]).toHaveTextContent("30 lb");
    expect(within(rows[0]).getByTestId("accessory-scheme")).toHaveTextContent("3 × 12–15");
    expect(within(rows[0]).getByTestId("accessory-reason")).toHaveTextContent("You usually do this on squat days");
    expect(within(rows[0]).getByRole("button", { name: "Why this weight for Bicep curls" })).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent("15 lb/hand");
    expect(rows[2]).toHaveTextContent("Enter weight");
  });

  it("shows one as a row, and offers to add when there are none", () => {
    const onChange = vi.fn();
    const { unmount } = render(<AccessoryRows views={THREE.slice(0, 1)} collapsible onChange={onChange} />);
    expect(screen.getAllByTestId("accessory-row")).toHaveLength(1);
    // No why without a page hosting the why sheet.
    expect(screen.queryByRole("button", { name: /Why this weight/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Change accessories" }));
    expect(onChange).toHaveBeenCalled();
    unmount();

    render(<AccessoryRows views={[]} changeHref={CHANGE_ACCESSORIES_HREF} />);
    expect(screen.getByText("No accessories today")).toBeInTheDocument();
  });

  it("lists every row when it does not fold", () => {
    render(<AccessoryRows views={THREE} />);
    expect(screen.getAllByTestId("accessory-row")).toHaveLength(3);
  });
});
