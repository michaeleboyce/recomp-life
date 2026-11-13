import { EXERCISES } from "@/lib/exercises";
import { LiftProjectionClient } from "./LiftProjectionClient";

// The pages are listed at build time so the iPhone app, which is built as
// static files, contains one for each lift.
export function generateStaticParams() {
  return Object.keys(EXERCISES).map((id) => ({ id }));
}

/** /progress/lift/[id]/projection: projected e1RM under alternatives (U18). */
export default function LiftProjectionPage() {
  return <LiftProjectionClient />;
}
