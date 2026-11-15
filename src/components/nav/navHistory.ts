// In-app history: which screens the user reached by navigating inside the app, in
// the order the browser holds them, so a back arrow can return to the previous
// screen instead of a fixed page.
//
// Every history entry the app creates is stamped with its position (STATE_KEY in
// `history.state`). Pushes and replaces are seen by wrapping `history.pushState` and
// `history.replaceState`, which the Next.js router and the app's own code both call;
// back and forward are seen through `popstate` and the stamp of the entry landed on.
// The list is kept in sessionStorage so a document the browser loads again from
// history (back after leaving the app) can pick it up. A reload, a link from outside
// the app or a new session starts a fresh list: there is no previous in-app screen.

export interface NavStack {
  /** History position of `entries[0]`. Positions count from the session's first screen. */
  base: number;
  /** In-app addresses (path, query and hash) by position; null where not known. */
  entries: (string | null)[];
  /** Position of the entry the user is on. */
  index: number;
}

export const STORAGE_KEY = "recomp.navHistory";
export const STATE_KEY = "__recompNav";
/** The list is short: only the last screens matter for a back arrow. */
export const MAX_ENTRIES = 30;

// ---------------------------------------------------------------------------
// Pure list operations
// ---------------------------------------------------------------------------

export function startStack(url: string): NavStack {
  return { base: 0, entries: [url], index: 0 };
}

function trim(base: number, entries: (string | null)[]): Pick<NavStack, "base" | "entries"> {
  const overflow = entries.length - MAX_ENTRIES;
  return overflow > 0 ? { base: base + overflow, entries: entries.slice(overflow) } : { base, entries };
}

/** A new entry after the current one; entries ahead of it (forward history) are dropped. */
export function pushUrl(stack: NavStack, url: string): NavStack {
  const index = stack.index + 1;
  const kept = stack.entries.slice(0, Math.max(0, index - stack.base));
  return { ...trim(stack.base, [...kept, url]), index };
}

/** The current entry now shows `url`; no entry is added. */
export function replaceUrl(stack: NavStack, url: string): NavStack {
  if (entryAt(stack, stack.index) === url) return stack;
  return setAt(stack, stack.index, url);
}

/** Back or forward to a stamped position. */
export function traverseTo(stack: NavStack, index: number, url: string): NavStack {
  const moved = stack.index === index ? stack : { ...stack, index };
  return entryAt(moved, index) === url ? moved : setAt(moved, index, url);
}

function setAt(stack: NavStack, index: number, url: string): NavStack {
  if (index < stack.base) {
    // Back past the kept entries: keep the far end of the list short instead.
    const entries = [url, ...Array<null>(stack.base - index - 1).fill(null), ...stack.entries];
    return { base: index, entries: entries.slice(0, MAX_ENTRIES), index: stack.index };
  }
  const entries = [...stack.entries];
  const i = index - stack.base;
  while (entries.length < i) entries.push(null);
  entries[i] = url;
  return { ...trim(stack.base, entries), index: stack.index };
}

export function entryAt(stack: NavStack, index: number): string | null {
  const i = index - stack.base;
  return i >= 0 && i < stack.entries.length ? stack.entries[i] : null;
}

/** The in-app screen before the current one, or null when there is none. */
export function previousUrl(stack: NavStack | null): string | null {
  return stack ? entryAt(stack, stack.index - 1) : null;
}

function isStack(value: unknown): value is NavStack {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<NavStack>;
  return (
    Number.isInteger(v.base) &&
    Number.isInteger(v.index) &&
    Array.isArray(v.entries) &&
    v.entries.every((e) => e === null || typeof e === "string")
  );
}

/** The stamped position in a history state, or null for an entry the app never stamped. */
export function readStamp(state: unknown): number | null {
  if (!state || typeof state !== "object") return null;
  const value = (state as Record<string, unknown>)[STATE_KEY];
  return Number.isInteger(value) ? (value as number) : null;
}

function withStamp(data: unknown, index: number): unknown {
  if (data === null || data === undefined) return { [STATE_KEY]: index };
  if (typeof data !== "object" || Array.isArray(data)) return data;
  return { ...(data as Record<string, unknown>), [STATE_KEY]: index };
}

export function urlOf(location: Pick<Location, "pathname" | "search" | "hash">): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

// ---------------------------------------------------------------------------
// Storage: may be missing or throw (private mode, blocked site data)
// ---------------------------------------------------------------------------

function readSaved(win: Window): NavStack | null {
  try {
    const raw = win.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStack(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function save(win: Window, stack: NavStack): void {
  try {
    win.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack));
  } catch {
    // The list still works for this page load; it is only not kept.
  }
}

function loadedByReload(win: Window): boolean {
  try {
    const [entry] = win.performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    return entry?.type === "reload";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// The tracker: one per window, installed by AppChrome
// ---------------------------------------------------------------------------

let current: NavStack | null = null;
const listeners = new Set<() => void>();
let uninstall: (() => void) | null = null;
let installedOn: Window | null = null;

let notifyQueued = false;

function commit(win: Window, next: NavStack): void {
  if (next === current) return;
  current = next;
  save(win, next);
  // The router writes history from an insertion effect, where React must not be
  // asked to re-render: tell subscribers once the current work is done. Reads
  // (getNavStack, canGoBackInApp) see the new list straight away.
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => {
    notifyQueued = false;
    listeners.forEach((listener) => listener());
  });
}

/** The list as it stands, or null before the tracker is installed (and on the server). */
export function getNavStack(): NavStack | null {
  return current;
}

export function subscribeNavStack(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when the current screen was reached from another in-app screen. */
export function canGoBackInApp(): boolean {
  return previousUrl(current) !== null;
}

/**
 * Starts recording. Safe to call more than once: only the first call on a window
 * installs anything. Never removed in the app, so the wrappers stay in place
 * whichever order the router and this module wrap `history`.
 */
export function installNavHistory(win: Window = window): void {
  if (installedOn === win) return;
  if (installedOn) uninstall?.();
  installedOn = win;
  const { history } = win;

  const here = urlOf(win.location);
  const stamp = readStamp(history.state);
  const saved = readSaved(win);
  const resume =
    !loadedByReload(win) && stamp !== null && saved !== null && entryAt(saved, stamp) === here;
  const first = resume ? { ...saved, index: stamp } : startStack(here);

  // Stamp the entry the session starts on. A state the router has not written yet
  // is left alone: the router's first write passes through the wrapper below.
  const nativePush = history.pushState;
  const nativeReplace = history.replaceState;
  if (history.state && typeof history.state === "object" && stamp !== first.index) {
    nativeReplace.call(history, withStamp(history.state, first.index), "", win.location.href);
  }

  history.pushState = function pushState(data: unknown, unused: string, url?: string | URL | null) {
    const index = (current?.index ?? -1) + 1;
    nativePush.call(history, withStamp(data, index), unused, url);
    const here = urlOf(win.location);
    commit(win, current ? pushUrl(current, here) : startStack(here));
  };

  history.replaceState = function replaceState(data: unknown, unused: string, url?: string | URL | null) {
    const index = current?.index ?? 0;
    nativeReplace.call(history, withStamp(data, index), unused, url);
    const here = urlOf(win.location);
    commit(win, current ? replaceUrl(current, here) : startStack(here));
  };

  const onPopState = (event: PopStateEvent) => {
    if (!current) return;
    const here = urlOf(win.location);
    const at = readStamp(event.state);
    if (at !== null) {
      commit(win, traverseTo(current, at, here));
      return;
    }
    // An entry the app never stamped (a plain #fragment link): match it by address.
    if (previousUrl(current) === here) commit(win, traverseTo(current, current.index - 1, here));
    else if (entryAt(current, current.index + 1) === here) commit(win, traverseTo(current, current.index + 1, here));
    else commit(win, pushUrl(current, here));
  };
  win.addEventListener("popstate", onPopState);

  uninstall = () => {
    history.pushState = nativePush;
    history.replaceState = nativeReplace;
    win.removeEventListener("popstate", onPopState);
  };

  commit(win, first);
}

/**
 * The address changed without the tracker seeing it (it should not happen): record
 * it as a new entry so the list stays in step with what is on screen.
 */
export function syncNavHistory(win: Window = window): void {
  if (!current) return;
  const here = urlOf(win.location);
  if (entryAt(current, current.index) !== here) commit(win, pushUrl(current, here));
}

/** Tests only: remove the wrappers and forget the list. */
export function resetNavHistoryForTests(): void {
  uninstall?.();
  uninstall = null;
  installedOn = null;
  current = null;
  listeners.clear();
}
