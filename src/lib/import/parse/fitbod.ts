import type { CsvRecord } from './csv'
import { cardioKind, cleanName, isCardioName, KG_TO_LB, MAX_REPS, MAX_WEIGHT_LB, num } from './common'
import { rowId } from './hash'
import type {
  ImportedCardio,
  ImportedSession,
  ImportedSet,
  ParsedExport,
  RejectedRow,
} from './types'

/**
 * Columns of the Fitbod-style export, in file order. Kept as a list (not one
 * literal header line) so the privacy guard (I12) can tell a header written
 * into the repo from the column names this parser needs.
 */
export const FITBOD_COLUMNS = [
  'Date',
  'Exercise',
  'Reps',
  'Weight(kg)',
  'Duration(s)',
  'Distance(m)',
  'Incline',
  'Resistance',
  'isWarmup',
  'Note',
  'multiplier',
] as const

/** Columns without which a file is not treated as this format. */
export const FITBOD_REQUIRED = ['date', 'exercise', 'reps', 'weight(kg)', 'multiplier'] as const

/**
 * SESSION GROUPING RULE. Every row of one logged workout carries the same
 * time stamp (to the second), and the file lists workouts newest first. So:
 * strength rows are put in ascending time order (ties keep file order, which
 * is the set order within the workout) and a new session starts whenever the
 * gap from the previous strength row exceeds SESSION_GAP_SECONDS. Identical
 * stamps always share a session; stamps a few seconds or minutes apart (a
 * workout saved in pieces) are merged; stamps hours apart are separate
 * sessions. Cardio rows are not part of grouping: each becomes its own
 * cardio entry at its own time stamp.
 */
export const SESSION_GAP_SECONDS = 30 * 60

/**
 * WHAT "multiplier" MEANS (established from the data, not documentation):
 * it is the number of times the stored weight counts towards the load moved,
 * i.e. the weight is per implement and multiplier says how many.
 *  - Dumbbell exercises carry 2 almost without exception, and the stored
 *    weights, once converted to pounds, sit on ordinary 5 lb dumbbell steps
 *    (so the weight is one dumbbell, not the pair). Barbell, most machine and
 *    most cable exercises carry 1 (one bar or one stack).
 *  - Bodyweight moves carry 1 or 2 with a weight of zero (2 for moves that
 *    work both sides at once), so the value is independent of the weight.
 *  - Dumbbell lunges, split squats, step-ups and similar single-leg moves
 *    carry 4 while their per-dumbbell weights are the same size as those of
 *    other dumbbell lifts: 4 is read as two dumbbells times two legs. The
 *    implement count is therefore 2, and the raw 4 is kept in multiplierRaw.
 *  - 0 appears on assisted machines and a few hip-bridge variants with a
 *    positive weight: the weight there is assistance or a prop, not load, so
 *    weightCountsAsLoad is false and implementCount is 1.
 * Any other value is kept raw with implementCount null (unknown).
 *
 * UNITS. Kilograms convert with the exact pound definition (1 lb =
 * 0.45359237 kg), unrounded. The app that wrote the file appears to have
 * converted from pounds with 2.20462, so a 30 lb dumbbell reads as 30.00003
 * lb; round at the point of use, not here.
 */
export function implementsFromMultiplier(m: number): {
  implementCount: number | null
  weightCountsAsLoad: boolean
} {
  if (m === 0) return { implementCount: 1, weightCountsAsLoad: false }
  if (m === 1) return { implementCount: 1, weightCountsAsLoad: true }
  if (m === 2 || m === 4) return { implementCount: 2, weightCountsAsLoad: true }
  return { implementCount: null, weightCountsAsLoad: true }
}

const TS =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/

/** Epoch milliseconds, or NaN. A stamp with no offset is read as UTC. */
export function parseFitbodStamp(s: string): number {
  const m = TS.exec(s.trim())
  if (!m) return NaN
  const [, y, mo, d, h, mi, se, off] = m
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se)
  const back = new Date(ms)
  if (back.getUTCMonth() !== +mo - 1 || back.getUTCDate() !== +d || +h > 23 || +mi > 59 || +se > 59) return NaN
  let offsetMin = 0
  if (off && off !== 'Z') {
    const sign = off[0] === '-' ? -1 : 1
    const digits = off.slice(1).replace(':', '')
    offsetMin = sign * (+digits.slice(0, 2) * 60 + +digits.slice(2))
  }
  return ms - offsetMin * 60000
}

interface Row {
  rec: CsvRecord
  key: string
  ts: number
  name: string
  set: Omit<ImportedSet, 'id' | 'setOrder'>
  note: string
}

export function parseFitbod(headerFields: string[], records: Iterator<CsvRecord>): ParsedExport {
  const idx = new Map<string, number>()
  headerFields.forEach((f, i) => {
    const k = cleanName(f).toLowerCase()
    if (!idx.has(k)) idx.set(k, i)
  })
  const col = (rec: string[], name: string): string => {
    const i = idx.get(name)
    return i === undefined ? '' : (rec[i] ?? '')
  }
  const need = Math.max(...FITBOD_REQUIRED.map((c) => idx.get(c) ?? 0)) + 1

  const rejected: RejectedRow[] = []
  const reject = (rowNumber: number, reason: string) =>
    rejected.push({ sourceApp: 'fitbod', rowNumber, reason })
  const cardio: ImportedCardio[] = []
  const rows: Row[] = []
  let rowCount = 0
  let lastStamp = ''
  let lastTs = NaN

  for (let r = records.next(); !r.done; r = records.next()) {
    const rec = r.value
    rowCount++
    const f = rec.fields
    if (rec.malformed) {
      reject(rec.line, 'unterminated quoted field')
      continue
    }
    if (f.length < need) {
      reject(rec.line, 'too few columns')
      continue
    }
    const stamp = col(f, 'date')
    let ts: number
    if (stamp === lastStamp) ts = lastTs
    else {
      ts = parseFitbodStamp(stamp)
      lastStamp = stamp
      lastTs = ts
    }
    if (Number.isNaN(ts)) {
      reject(rec.line, 'unreadable date')
      continue
    }
    const name = cleanName(col(f, 'exercise'))
    if (!name) {
      reject(rec.line, 'missing exercise name')
      continue
    }
    const reps = num(col(f, 'reps'))
    const kg = num(col(f, 'weight(kg)'))
    const dur = num(col(f, 'duration(s)'))
    const dist = num(col(f, 'distance(m)'))
    const mult = num(col(f, 'multiplier'))
    const warm = col(f, 'iswarmup').trim().toLowerCase()

    // Impossible values
    const bad =
      reps < 0 || reps > MAX_REPS
        ? 'reps out of range'
        : kg < 0
          ? 'negative weight'
          : kg * KG_TO_LB > MAX_WEIGHT_LB
            ? 'weight over 1,000 lb'
            : dur < 0
              ? 'negative duration'
              : dist < 0
                ? 'negative distance'
                : Number.isNaN(reps) && Number.isNaN(dur) && Number.isNaN(dist)
                  ? 'no reps, duration or distance'
                  : warm !== '' && warm !== 'true' && warm !== 'false'
                    ? 'unreadable warm-up flag'
                    : null
    if (bad) {
      reject(rec.line, bad)
      continue
    }

    const hasDur = dur > 0
    const hasDist = dist > 0
    const hasWeight = kg > 0
    const isCardio = isCardioName(name) || (hasDist && !hasWeight && !(reps > 0))
    if (isCardio) {
      if (!hasDur && !hasDist) {
        reject(rec.line, 'cardio row with no duration or distance')
        continue
      }
      const iso = new Date(ts).toISOString()
      cardio.push({
        id: rowId('fitbod', 'cardio', f.join('\u001f')),
        sourceApp: 'fitbod',
        kind: cardioKind(name),
        name,
        start: iso,
        startIsLocal: false,
        durationSec: hasDur ? dur : null,
        distanceM: hasDist ? dist : null,
        rowNumber: rec.line,
      })
      continue
    }
    if (!(reps > 0) && !hasDur) {
      reject(rec.line, 'no reps or duration')
      continue
    }
    const { implementCount, weightCountsAsLoad } = Number.isNaN(mult)
      ? { implementCount: null, weightCountsAsLoad: true }
      : implementsFromMultiplier(mult)
    rows.push({
      rec,
      key: f.join('\u001f'),
      ts,
      name,
      note: cleanName(col(f, 'note')),
      set: {
        exerciseName: name,
        reps: reps > 0 ? reps : null,
        weightPerImplementLb: Number.isNaN(kg) ? null : kg * KG_TO_LB,
        implementCount,
        multiplierRaw: Number.isNaN(mult) ? null : mult,
        weightCountsAsLoad,
        durationSec: hasDur ? dur : null,
        distanceM: null,
        role: warm === 'true' ? 'warmup' : 'work',
        effort: null,
        rowNumber: rec.line,
      },
    })
  }
  return finish(rows, cardio, rejected, rowCount)
}

function finish(rows: Row[], cardio: ImportedCardio[], rejected: RejectedRow[], rowCount: number): ParsedExport {
  // stable ascending sort: ties keep file order
  const order = rows.map((_, i) => i)
  order.sort((a, b) => rows[a].ts - rows[b].ts || a - b)

  const sessions: ImportedSession[] = []
  let cur: ImportedSession | null = null
  let curRows: Row[] = []
  let lastTs = 0
  let perExercise = new Map<string, number>()
  let occurrences = new Map<string, number>()
  const notes = new Set<string>()
  const close = () => {
    if (!cur) return
    const first = curRows[0]
    const last = curRows[curRows.length - 1]
    cur.end = last.ts > first.ts ? new Date(last.ts).toISOString() : null
    cur.notes = [...notes].join('; ')
  }
  for (const i of order) {
    const row = rows[i]
    if (!cur || row.ts - lastTs > SESSION_GAP_SECONDS * 1000) {
      close()
      const start = new Date(row.ts).toISOString()
      cur = {
        id: rowId('fitbod', 'session', start),
        sourceApp: 'fitbod',
        start,
        startIsLocal: false,
        end: null,
        title: '',
        notes: '',
        sets: [],
      }
      sessions.push(cur)
      curRows = []
      perExercise = new Map()
      occurrences = new Map()
      notes.clear()
    }
    lastTs = row.ts
    curRows.push(row)
    const order1 = (perExercise.get(row.name) ?? 0) + 1
    perExercise.set(row.name, order1)
    const occ = occurrences.get(row.key) ?? 0
    occurrences.set(row.key, occ + 1)
    if (row.note) notes.add(row.note)
    cur.sets.push({ id: rowId('fitbod', 'set', row.key, occ), setOrder: order1, ...row.set })
  }
  close()
  return { app: 'fitbod', sessions, cardio, rejected, rowCount }
}
