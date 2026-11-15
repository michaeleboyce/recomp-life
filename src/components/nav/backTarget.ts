// Where a page opened "from" somewhere should send the user back to. The `from`
// query value is only ever looked up in this table; an unknown value is ignored,
// so the URL can never send the user to an arbitrary place.

export type FromKey = "today" | "body" | "cardio" | "muscles" | "progress" | "log" | "more";

export interface BackTarget {
  href: string;
  label: string;
}

const TARGETS: Record<FromKey, BackTarget> = {
  today: { href: "/", label: "Today" },
  body: { href: "/progress?tab=body", label: "Progress" },
  cardio: { href: "/progress?tab=runs", label: "Progress" },
  muscles: { href: "/progress?tab=muscles", label: "Progress" },
  progress: { href: "/progress", label: "Progress" },
  log: { href: "/log", label: "Log" },
  more: { href: "/more", label: "More" },
};

function isFromKey(value: string | null | undefined): value is FromKey {
  return typeof value === "string" && Object.hasOwn(TARGETS, value);
}

/** The target for a `from` value, or `fallback` when it is missing or unknown. */
export function backTarget(from: string | null | undefined, fallback: FromKey = "today"): BackTarget {
  return TARGETS[isFromKey(from) ? from : fallback];
}

/** The `from` value for a screen the user is on now, or null when it is not a start point. */
export function fromForPage(pathname: string, tab: string | null): FromKey | null {
  if (pathname === "/") return "today";
  if (pathname === "/log") return "log";
  if (pathname === "/more") return "more";
  if (pathname === "/progress") {
    if (tab === "body") return "body";
    if (tab === "runs") return "cardio";
    if (tab === "muscles") return "muscles";
    return "progress";
  }
  return null;
}

/** `href` with `?from=` added when the start point is known. */
export function withFrom(href: string, from: FromKey | null | undefined): string {
  return from ? `${href}?from=${from}` : href;
}
