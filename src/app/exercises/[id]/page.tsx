import { notFound } from "next/navigation";
import { EXERCISES } from "@/lib/exercises";
import ExerciseDetail from "@/components/Exercises/ExerciseDetail";

// Every exercise page is generated at build time so it can be cached for
// offline use.
export function generateStaticParams() {
  return Object.keys(EXERCISES).map((id) => ({ id }));
}

export const dynamicParams = false;

export default async function ExercisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!EXERCISES[id]) notFound();
  return <ExerciseDetail exerciseId={id} />;
}
