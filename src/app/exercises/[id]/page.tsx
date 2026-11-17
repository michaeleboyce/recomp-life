import { notFound } from "next/navigation";
import { EXERCISES } from "@/lib/exercises";
import { ExercisePageClient } from "./ExercisePageClient";

// Every exercise page is generated at build time so it can be cached for
// offline use.
export function generateStaticParams() {
  return Object.keys(EXERCISES).map((id) => ({ id }));
}

export const dynamicParams = false;

/** /exercises/<id>: the exercise's own page, Training and Form (E1). */
export default async function ExerciseRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!EXERCISES[id]) notFound();
  return <ExercisePageClient exerciseId={id} />;
}
