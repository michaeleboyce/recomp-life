"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { initializeDatabase } from "@/db/init";

const DbReadyContext = createContext(false);

/** True once the local database has been initialised (or initialisation failed). */
export function useDbReady(): boolean {
  return useContext(DbReadyContext);
}

/**
 * Initialises (seeds) the local database once for the whole app and renders its
 * children only after that, so no page ever reads an unseeded database. A failed
 * initialisation is logged and the app renders anyway rather than hanging.
 */
export function DbProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    initializeDatabase()
      .catch((err) => {
        console.error("Failed to initialise the local database:", err);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <div
        data-testid="db-loading"
        aria-busy="true"
        className="flex min-h-screen items-center justify-center"
      >
        <div className="h-6 w-40 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  return <DbReadyContext.Provider value={true}>{children}</DbReadyContext.Provider>;
}
