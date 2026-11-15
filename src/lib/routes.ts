// Addresses of pages whose content depends on a run-time id. The id travels in
// the query string, not the path: the iPhone app is built as static files, and
// a static build can only contain paths that are known when it is built.

/** The detail page of one logged workout. */
export function workoutDetailHref(workoutId: string): string {
  return `/log/workout?id=${encodeURIComponent(workoutId)}`;
}
