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
