"use client";

import { usePathname } from "next/navigation";
import BottomNav from "@/components/BottomNav";

/** Routes that run full-screen, without the bottom nav or the padding reserved for it. */
const FULL_SCREEN_PREFIXES = ["/workout/active"];

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const fullScreen = FULL_SCREEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (fullScreen) {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <>
      <div className="min-h-screen pb-28">{children}</div>
      <BottomNav />
    </>
  );
}
