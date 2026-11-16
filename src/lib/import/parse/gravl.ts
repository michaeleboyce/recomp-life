import type { CsvRecord } from './csv'
import { cardioKind, cleanName, isCardioName, MAX_REPS, MAX_WEIGHT_LB, MILE_TO_M, num, pad2 } from './common'
import { rowId } from './hash'
import type {
  ImportedCardio,
  ImportedSession,
  ImportedSet,
  ImportSetRole,
  ParsedExport,
  RejectedRow,
} from './types'

/** Columns of the Gravl export in file order (a list, see FITBOD_COLUMNS). */
export const GRAVL_COLUMNS = [
  'Date',
  'Start Date',
  'Workout',
  'Source',
  'Workout Duration (min)',
  'Energy',
  'Exercise',
  'Superset',
  'Set',
  'Set Type',
  'Reps',
  'Weight (lb)',
  'Distance (mi)',
  'Set Duration (sec)',
  'Incline',
  'Steps',
  'Effort',
  'Workout Notes',
] as const

export const GRAVL_REQUIRED = ['date', 'start date', 'workout', 'exercise', 'set type', 'reps', 'weight (lb)'] as const

/**
 * Gravl times carry no zone: Date is year/month/day and Start Date is a
 * clock time with AM/PM (a narrow no-break space precedes AM/PM). The result
 * is local wall-clock time, flagged startIsLocal. Returns "YYYY-MM-DDTHH:MM:SS".
 */
export function parseGravlLocal(date: string, time: string): string | null {
  const d = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(cleanName(date))
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(cleanName(time))
  if (!d || !t) return null
  const y = +d[1]
  const mo = +d[2]
  const day = +d[3]
  let h = +t[1]
  const mi = +t[2]
  const se = t[3] ? +t[3] : 0
  const ap = t[4]?.toUpperCase()
  if (ap) {
    if (h < 1 || h > 12) return null
    h = (h % 12) + (ap === 'PM' ? 12 : 0)
  }
  if (h > 23 || mi > 59 || se > 59) return null
  const probe = new Date(Date.UTC(y, mo - 1, day))
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== day) return null
  return `${y}-${pad2(mo)}-${pad2(day)}T${pad2(h)}:${pad2(mi)}:${pad2(se)}`
}

function addSecondsLocal(iso: string, sec: number): string {
  // wall-clock arithmetic through UTC (ignores daylight-saving shifts, fine for an end time)
  const ms = Date.parse(`${iso}Z`) + sec * 1000
  return new Date(ms).toISOString().slice(0, 19)
}

function roleOf(setType: string): ImportSetRole | null {
  switch (setType.trim().toLowerCase()) {
    case 'warmup':
    case 'warm-up':
    case 'warm up':
      return 'warmup'
    case 'normal':
    case 'working':
      return 'work'
    case 'dropset':
    case 'drop set':
    case 'drop':
      return 'drop'
    default:
      return null
  }
}

export function parseGravl(headerFields: string[], records: Iterator<CsvRecord>): ParsedExport {
  const idx = new Map<string, number>()
  headerFields.forEach((f, i) => {
    const k = cleanName(f).toLowerCase()
    if (!idx.has(k)) idx.set(k, i)
  })
  const col = (rec: string[], name: string): string => {
    const i = idx.get(name)
    return i === undefined ? '' : (rec[i] ?? '')
  }
  const need = Math.max(...GRAVL_REQUIRED.map((c) => idx.get(c) ?? 0)) + 1

  const rejected: RejectedRow[] = []
  const reject = (rowNumber: number, reason: string) =>
    rejected.push({ sourceApp: 'gravl', rowNumber, reason })
  const cardio: ImportedCardio[] = []
  const sessions = new Map<string, ImportedSession>()
  const perExercise = new Map<string, Map<string, number>>() // session key -> exercise -> count
  const occurrences = new Map<string, Map<string, number>>()
  let rowCount = 0

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
    const date = col(f, 'date')
    const startTime = col(f, 'start date')
    const start = parseGravlLocal(date, startTime)
    if (!start) {
      reject(rec.line, 'unreadable date or start time')
      continue
    }
    const title = cleanName(col(f, 'workout'))
    const name = cleanName(col(f, 'exercise'))
    if (!name) {
      reject(rec.line, 'missing exercise name')
      continue
    }
    const source = cleanName(col(f, 'source'))
    const reps = num(col(f, 'reps'))
    const lb = num(col(f, 'weight (lb)'))
    const mi = num(col(f, 'distance (mi)'))
    const dur = num(col(f, 'set duration (sec)'))
    const setNo = num(col(f, 'set'))
    const role = roleOf(col(f, 'set type'))
    const workoutMin = num(col(f, 'workout duration (min)'))

    const bad =
      role === null
        ? 'unknown set type'
        : reps < 0 || reps > MAX_REPS
          ? 'reps out of range'
          : lb < 0
            ? 'negative weight'
            : lb > MAX_WEIGHT_LB
              ? 'weight over 1,000 lb'
              : mi < 0
                ? 'negative distance'
                : dur < 0
                  ? 'negative duration'
                  : workoutMin < 0
                    ? 'negative workout duration'
                    : null
    if (bad) {
      reject(rec.line, bad)
      continue
    }

    const hasDist = mi > 0
    const hasDur = dur > 0
    const content = f.join('\u001f')

    // Watch-recorded cardio (the Source column names the watch) becomes a cardio entry.
    const isCardio = source !== '' && (isCardioName(name) || (hasDist && !(reps > 0) && !(lb > 0)))
    if (isCardio) {
      const durationSec = hasDur ? dur : workoutMin > 0 ? workoutMin * 60 : null
      if (durationSec === null && !hasDist) {
        reject(rec.line, 'cardio row with no duration or distance')
        continue
      }
      cardio.push({
        id: rowId('gravl', 'cardio', content),
        sourceApp: 'gravl',
        kind: cardioKind(name),
        name,
        start,
        startIsLocal: true,
        durationSec,
        distanceM: hasDist ? mi * MILE_TO_M : null,
        rowNumber: rec.line,
      })
      continue
    }
    if (!(reps > 0) && !hasDur) {
      reject(rec.line, 'no reps or duration')
      continue
    }

    const key = `${date}\u001f${startTime}\u001f${title}`
    let session = sessions.get(key)
    if (!session) {
      session = {
        id: rowId('gravl', 'session', key),
        sourceApp: 'gravl',
        start,
        startIsLocal: true,
        end: workoutMin > 0 ? addSecondsLocal(start, workoutMin * 60) : null,
        title,
        notes: cleanName(col(f, 'workout notes')),
        sets: [],
      }
      sessions.set(key, session)
      perExercise.set(key, new Map())
      occurrences.set(key, new Map())
    }
    const counts = perExercise.get(key) as Map<string, number>
    const seen = occurrences.get(key) as Map<string, number>
    const nth = (counts.get(name) ?? 0) + 1
    counts.set(name, nth)
    const occ = seen.get(content) ?? 0
    seen.set(content, occ + 1)
    const effort = cleanName(col(f, 'effort'))
    const set: ImportedSet = {
      id: rowId('gravl', 'set', content, occ),
      exerciseName: name,
      setOrder: setNo > 0 ? setNo : nth,
      reps: reps > 0 ? reps : null,
      weightPerImplementLb: Number.isNaN(lb) ? null : lb,
      // The file does not say how many dumbbells the weight is per.
      implementCount: null,
      multiplierRaw: null,
      weightCountsAsLoad: true,
      durationSec: hasDur ? dur : null,
      distanceM: hasDist ? mi * MILE_TO_M : null,
      role: role as ImportSetRole,
      effort: effort || null,
      rowNumber: rec.line,
    }
    session.sets.push(set)
  }
  return { app: 'gravl', sessions: [...sessions.values()], cardio, rejected, rowCount }
}
