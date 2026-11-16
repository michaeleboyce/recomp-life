/**
 * Neutral shape produced by the history-import parsers (requirement I1).
 * Pure data: no React, no database. Units are the app's internal ones:
 * weight in pounds, duration in seconds, distance in metres.
 */

export type ImportSourceApp = 'fitbod' | 'gravl'

/** warmup and drop sets keep their role; everything else is 'work'. */
export type ImportSetRole = 'warmup' | 'work' | 'drop'

export type CardioKind = 'run' | 'walk' | 'cycle' | 'elliptical' | 'hike' | 'swim' | 'row' | 'other'

export interface ImportedSet {
  /** Deterministic: derived from the source app and the original row's content. */
  id: string
  /** Name as written in the file (apostrophes and spaces normalised, case kept). */
  exerciseName: string
  /** 1-based position of the set within its exercise in the session. */
  setOrder: number
  reps: number | null
  /** Weight of ONE implement in pounds, converted exactly (never rounded here). */
  weightPerImplementLb: number | null
  /** How many implements the weight is per (2 dumbbells). null when the file does not say. */
  implementCount: number | null
  /** The raw "multiplier" value when the source has one (kept in case of ambiguity). */
  multiplierRaw: number | null
  /** false when the source marks the weight as not adding load (assistance weights). */
  weightCountsAsLoad: boolean
  durationSec: number | null
  distanceM: number | null
  role: ImportSetRole
  /** Effort word as given by the source ("Easy", "Ideal", "Hard"), else null. */
  effort: string | null
  /** 1-based physical line of the record in the file (the header is line 1). */
  rowNumber: number
}

export interface ImportedSession {
  id: string
  sourceApp: ImportSourceApp
  /** ISO 8601. UTC with a trailing Z unless startIsLocal. */
  start: string
  /** true when the file carries no time zone: start/end are local wall-clock, no Z. */
  startIsLocal: boolean
  end: string | null
  title: string
  notes: string
  sets: ImportedSet[]
}

export interface ImportedCardio {
  id: string
  sourceApp: ImportSourceApp
  kind: CardioKind
  /** Name as written. */
  name: string
  start: string
  startIsLocal: boolean
  durationSec: number | null
  distanceM: number | null
  rowNumber: number
}

export interface RejectedRow {
  sourceApp: ImportSourceApp | 'unknown'
  rowNumber: number
  reason: string
}

export interface ParsedExport {
  app: ImportSourceApp | 'unknown'
  sessions: ImportedSession[]
  cardio: ImportedCardio[]
  rejected: RejectedRow[]
  /** Data records seen (blank lines and the header excluded). */
  rowCount: number
  /** Set when the header was not recognised. */
  error?: string
}
