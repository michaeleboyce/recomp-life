"use client";

import { Suspense } from "react";
import { ResearchLibrary } from "@/components/Evidence/ResearchLibrary";

// The library reads `?rule=` and `?model=`, so it sits in a Suspense boundary.
export default function ResearchPage() {
  return (
    <Suspense fallback={null}>
      <ResearchLibrary />
    </Suspense>
  );
}
