import { MAIN_LIFTS } from "@/components/Progress/lifts";
import { LiftPageClient } from "./LiftPageClient";

// The pages are listed at build time so the iPhone app, which is built as
// static files, contains one for each main lift.
export function generateStaticParams() {
  return MAIN_LIFTS.map((id) => ({ id }));
}

export default function LiftPage() {
  return <LiftPageClient />;
}
