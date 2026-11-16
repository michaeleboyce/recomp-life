import { csvRecords } from './csv'
import { cleanName } from './common'
import { FITBOD_REQUIRED, parseFitbod } from './fitbod'
import { GRAVL_REQUIRED, parseGravl } from './gravl'
import type { ImportSourceApp, ParsedExport } from './types'

export * from './types'
export { FITBOD_COLUMNS, SESSION_GAP_SECONDS, implementsFromMultiplier } from './fitbod'
export { GRAVL_COLUMNS } from './gravl'
export { hashString } from './hash'
export { KG_TO_LB, MILE_TO_M } from './common'

function headerKeys(fields: string[]): Set<string> {
  return new Set(fields.map((f) => cleanName(f).toLowerCase()))
}

/** Which app wrote this header (a list of column names), or null. Extra columns are allowed. */
export function detectFormatFromColumns(fields: string[]): ImportSourceApp | null {
  const keys = headerKeys(fields)
  if (FITBOD_REQUIRED.every((c) => keys.has(c))) return 'fitbod'
  if (GRAVL_REQUIRED.every((c) => keys.has(c))) return 'gravl'
  return null
}

/** Detect from the file text (reads only the first record). */
export function detectFormat(text: string): ImportSourceApp | null {
  const first = csvRecords(text).next()
  return first.done ? null : detectFormatFromColumns(first.value.fields)
}

/**
 * Parse an export file's text. Pure: the same text always gives the same
 * result with the same ids. Rows that cannot be used are returned in
 * `rejected` with a reason, never dropped silently.
 */
export function parseExport(text: string): ParsedExport {
  const records = csvRecords(text)
  const head = records.next()
  if (head.done) {
    return { app: 'unknown', sessions: [], cardio: [], rejected: [], rowCount: 0, error: 'The file is empty.' }
  }
  const app = detectFormatFromColumns(head.value.fields)
  if (app === 'fitbod') return parseFitbod(head.value.fields, records)
  if (app === 'gravl') return parseGravl(head.value.fields, records)
  return {
    app: 'unknown',
    sessions: [],
    cardio: [],
    rejected: [],
    rowCount: 0,
    error: 'The first line is not a header this app can read.',
  }
}
