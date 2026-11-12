import { redirect } from "next/navigation";

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Redirect to `path`, carrying the incoming query string across. */
export function redirectWithQuery(path: string, params: RawSearchParams = {}): never {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((v) => query.append(key, v));
    else if (value !== undefined) query.append(key, value);
  }
  const qs = query.toString();
  return redirect(qs ? `${path}?${qs}` : path);
}
