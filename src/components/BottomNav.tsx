"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Clock, BookOpen, Wrench } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: Home, alsoActive: [] as string[] },
  { href: "/history", label: "History", icon: Clock, alsoActive: [] as string[] },
  { href: "/program", label: "Program", icon: BookOpen, alsoActive: [] as string[] },
  { href: "/tools", label: "Tools", icon: Wrench, alsoActive: ["/exercises", "/1rm-calculator"] },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around">
        {NAV_ITEMS.map(({ href, label, icon: Icon, alsoActive }) => {
          const isActive = href === "/"
            ? pathname === "/"
            : pathname.startsWith(href) || alsoActive.some((p) => pathname.startsWith(p));
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 px-3 py-2 text-xs transition-all active:scale-[0.95] ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
