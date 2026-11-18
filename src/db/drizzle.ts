import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

type NeonClient = NeonQueryFunction<false, false>;

let client: NeonClient | undefined;

/**
 * The Neon client, made on the first query and kept. Nothing connects when this module
 * loads, so a build with no `DATABASE_URL` (a Vercel preview deployment, which is not
 * given the live database's address) succeeds; only a query without one fails, by name.
 */
function connect(): NeonClient {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set: this deployment has no database.');
    client = neon(url);
  }
  return client;
}

/** Runs one parameterised query. Rejects when there is no database or the query fails. */
export const neonSql = {
  query: async (text: string, values?: unknown[]) => connect().query(text, values),
};

/** The Drizzle handle on the same client, made on demand like the client itself. */
export function pgDb() {
  return drizzle(connect(), { schema });
}
