// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Runs public/sw.js against a fake service worker scope: an in-memory cache, a
 * scripted `fetch`, and the listeners it registers. API responses must never be
 * written to the cache or served from it.
 */

const SOURCE = readFileSync(path.resolve(__dirname, "../public/sw.js"), "utf8");
const ORIGIN = "https://app.example";

type Listener = (event: Record<string, unknown>) => void;

interface Worker {
  listeners: Record<string, Listener>;
  /** Cache contents by cache name, then by absolute URL. */
  stores: Map<string, Map<string, Response>>;
  fetched: string[];
  network: { online: boolean; responses: Record<string, () => Response> };
  cacheName: string;
}

const keyOf = (request: string | Request) =>
  new URL(typeof request === "string" ? request : request.url, ORIGIN).href;

function startWorker(): Worker {
  const worker: Worker = {
    listeners: {},
    stores: new Map(),
    fetched: [],
    network: { online: true, responses: {} },
    cacheName: "",
  };

  const openCache = (name: string) => {
    if (!worker.stores.has(name)) worker.stores.set(name, new Map());
    const store = worker.stores.get(name)!;
    return {
      match: async (request: string | Request) => store.get(keyOf(request))?.clone(),
      put: async (request: string | Request, response: Response) => {
        store.set(keyOf(request), response);
      },
      addAll: async (urls: string[]) => {
        for (const url of urls) store.set(keyOf(url), new Response("precached"));
      },
    };
  };

  const caches = {
    open: async (name: string) => {
      worker.cacheName = name;
      return openCache(name);
    },
    keys: async () => [...worker.stores.keys()],
    delete: async (name: string) => worker.stores.delete(name),
    match: async (request: string | Request) => {
      for (const store of worker.stores.values()) {
        const hit = store.get(keyOf(request));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };

  const fetch = async (request: string | Request) => {
    const url = keyOf(request);
    worker.fetched.push(url);
    if (!worker.network.online) throw new TypeError("Failed to fetch");
    const make = worker.network.responses[new URL(url).pathname];
    return make ? make() : new Response("not found", { status: 404 });
  };

  const self = {
    addEventListener: (type: string, listener: Listener) => {
      worker.listeners[type] = listener;
    },
    skipWaiting: () => {},
    clients: { claim: () => {} },
  };

  new Function("self", "caches", "fetch", SOURCE)(self, caches, fetch);
  return worker;
}

/** Dispatches a fetch event; resolves to the worker's response, or null if it did not respond. */
async function dispatchFetch(worker: Worker, pathname: string, init?: RequestInit) {
  let responded: Promise<Response> | null = null;
  worker.listeners.fetch({
    request: new Request(ORIGIN + pathname, init),
    respondWith: (response: Promise<Response>) => {
      responded = response;
    },
  });
  const response = await (responded as Promise<Response> | null);
  // Let the fire-and-forget cache write settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return response;
}

async function dispatchWaiting(worker: Worker, type: string, event: Record<string, unknown> = {}) {
  const pending: Promise<unknown>[] = [];
  worker.listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => pending.push(p) });
  await Promise.all(pending);
}

const cachedPaths = (worker: Worker) =>
  [...worker.stores.values()].flatMap((store) => [...store.keys()].map((u) => new URL(u).pathname));

const json = (body: unknown) => () =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

let worker: Worker;

beforeEach(() => {
  worker = startWorker();
});

describe("service worker: API requests", () => {
  it("does not handle /api/ requests at all, so they always go to the network", async () => {
    worker.network.responses["/api/sync/pull"] = json({ workouts: [] });
    worker.network.responses["/api/sync/status"] = json({ ok: true });

    expect(await dispatchFetch(worker, "/api/sync/pull")).toBeNull();
    expect(await dispatchFetch(worker, "/api/sync/status")).toBeNull();
    expect(await dispatchFetch(worker, "/api/auth/session")).toBeNull();
    expect(worker.fetched).toEqual([]);
    expect(cachedPaths(worker)).toEqual([]);
  });

  it("never serves an API response from the cache, even offline", async () => {
    // A response left behind by an older worker version in the current cache.
    const cache = new Map([[ORIGIN + "/api/sync/pull", new Response("stale")]]);
    worker.stores.set("some-cache", cache);
    worker.network.online = false;

    expect(await dispatchFetch(worker, "/api/sync/pull")).toBeNull();
  });

  it("does not warm the cache with API URLs", async () => {
    worker.network.responses["/api/sync/pull"] = json({ workouts: [] });
    worker.network.responses["/history"] = () =>
      new Response("<html></html>", { headers: { "content-type": "text/html" } });

    await dispatchWaiting(worker, "message", {
      data: { type: "WARM_CACHE", urls: ["/api/sync/pull", "/history"] },
    });

    expect(worker.fetched).toEqual([ORIGIN + "/history"]);
    expect(cachedPaths(worker)).toEqual(["/history"]);
  });

  it("still treats a page whose path only contains 'api' as a page", async () => {
    worker.network.responses["/apiary"] = () => new Response("page");
    const response = await dispatchFetch(worker, "/apiary");
    expect(await response!.text()).toBe("page");
    expect(cachedPaths(worker)).toEqual(["/apiary"]);
  });
});

describe("service worker: everything else is unchanged", () => {
  it("caches a successful page response and serves it when offline", async () => {
    worker.network.responses["/history"] = () => new Response("history page");
    expect(await (await dispatchFetch(worker, "/history"))!.text()).toBe("history page");
    expect(cachedPaths(worker)).toEqual(["/history"]);

    worker.network.online = false;
    expect(await (await dispatchFetch(worker, "/history"))!.text()).toBe("history page");
  });

  it("leaves non-GET requests alone", async () => {
    expect(await dispatchFetch(worker, "/history", { method: "POST", body: "x" })).toBeNull();
  });

  it("warm-up follows the build assets a page names", async () => {
    worker.network.responses["/program"] = () =>
      new Response('<script src="/_next/static/chunks/main-abc.js"></script>', {
        headers: { "content-type": "text/html" },
      });
    worker.network.responses["/_next/static/chunks/main-abc.js"] = () =>
      new Response('import("static/chunks/viewer-def.js")', {
        headers: { "content-type": "application/javascript" },
      });
    worker.network.responses["/_next/static/chunks/viewer-def.js"] = () =>
      new Response("viewer", { headers: { "content-type": "application/javascript" } });

    await dispatchWaiting(worker, "message", { data: { type: "WARM_CACHE", urls: ["/program"] } });

    expect(cachedPaths(worker).sort()).toEqual([
      "/_next/static/chunks/main-abc.js",
      "/_next/static/chunks/viewer-def.js",
      "/program",
    ]);
  });

  it("activation drops every cache except the current version", async () => {
    await dispatchWaiting(worker, "install");
    const current = worker.cacheName;
    // v4 is the last version that could hold cached API responses.
    expect(current).not.toBe("recomp-life-v4");
    worker.stores.set("recomp-life-v4", new Map([[ORIGIN + "/api/sync/pull", new Response("stale")]]));

    await dispatchWaiting(worker, "activate");

    expect([...worker.stores.keys()]).toEqual([current]);
  });
});
