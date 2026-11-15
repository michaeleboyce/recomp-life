import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExerciseImage, hasExercisePhoto } from "./exercise-image";

describe("hasExercisePhoto", () => {
  it("is true for a lift with photos and false otherwise", () => {
    expect(hasExercisePhoto("deadlift")).toBe(true);
    expect(hasExercisePhoto("no_such_exercise")).toBe(false);
  });
});

describe("ExerciseImage", () => {
  it("renders a plain greyscale img with explicit size, decorative by default", () => {
    const { container } = render(<ExerciseImage exerciseId="deadlift" variant="arch" />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", "/exercise-media/deadlift/0.jpg");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("width", "850");
    expect(img).toHaveAttribute("height", "567");
    expect(img).toHaveClass("grayscale");
    expect(container.firstElementChild).toHaveClass("rounded-t-full");
  });

  it("lays a colour-blend tint layer over the photo", () => {
    const { container } = render(<ExerciseImage exerciseId="squat" variant="thumb" />);
    const tint = container.querySelector('[data-slot="photo-tint"]')!;
    expect(tint).toHaveClass("mix-blend-color");
    expect(tint.className).toContain("bg-[var(--photo-tint)]");
    expect(container.querySelector('[data-slot="photo-fade"]')).toBeNull();
  });

  it("fades a hero into the page and accepts alt text and position", () => {
    const { container } = render(
      <ExerciseImage exerciseId="deadlift" variant="hero" frame={1} alt="Deadlift" position="30% 38%" />
    );
    const img = screen.getByAltText("Deadlift");
    expect(img).toHaveAttribute("src", "/exercise-media/deadlift/1.jpg");
    expect(img.style.objectPosition).toBe("30% 38%");
    expect(container.querySelector('[data-slot="photo-fade"]')).not.toBeNull();
  });

  it("renders nothing when the exercise has no photo", () => {
    const { container } = render(<ExerciseImage exerciseId="no_such_exercise" variant="hero" />);
    expect(container).toBeEmptyDOMElement();
  });
});
