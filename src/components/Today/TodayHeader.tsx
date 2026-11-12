"use client";

import { useState } from "react";
import { formatTodayDate } from "./format";

/** The date in small capitals over "Today". Settings lives under More. */
export function TodayHeader() {
  const [today] = useState(() => new Date());
  return (
    <header className="flex flex-col gap-0.5">
      <span className="text-xs tracking-wide text-muted-foreground uppercase">
        {formatTodayDate(today)}
      </span>
      <h1 className="text-[26px] font-extrabold text-foreground">Today</h1>
    </header>
  );
}
