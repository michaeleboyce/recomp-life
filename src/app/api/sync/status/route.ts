import { syncJson } from '../respond';

export async function GET() {
  return syncJson({ ok: true, timestamp: new Date().toISOString() });
}
