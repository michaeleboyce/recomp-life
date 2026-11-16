// Response helpers shared by the /api/sync routes. Server only.
import { NextResponse } from 'next/server';
import { SYNC_CACHE_CONTROL } from '@/lib/apiBase';

/**
 * A JSON response for a sync route, marked `Cache-Control: no-store`. Every sync
 * response goes through here, refusals and errors included.
 */
export function syncJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': SYNC_CACHE_CONTROL } });
}

/**
 * Codes returned in place of database or driver errors, which can name tables,
 * users or hosts. The full error goes to the server log (console.error) only.
 */
export const SYNC_ERROR_CODE = {
  pushFailed: 'push_failed',
  readFailed: 'read_failed',
} as const;

/** The 500 body's `error` when a push could not be written. */
export const PUSH_FAILED_MESSAGE = 'The server could not save these rows. The details are in the server log.';

/** A pull's reason for a table it could not read (the `errors` values are plain strings). */
export const READ_FAILED_REASON = `The server could not read this table (${SYNC_ERROR_CODE.readFailed}). The details are in the server log.`;
