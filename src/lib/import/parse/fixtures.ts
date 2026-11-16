/**
 * Test-only builders for MADE-UP export files. Every value is invented; only
 * the column layout matches the real formats.
 *
 * Why the privacy guard (src/lib/import/privacy.test.ts) ignores this file:
 * the guard looks for a header written out as one literal line followed by a
 * data-looking line. Here the header is only ever produced at run time by
 * joining the column-name list, and rows are produced from objects, so no
 * file in the repo contains either a header line or a data row as text. The
 * built text exists only in memory while a test runs.
 */
import { FITBOD_COLUMNS, GRAVL_COLUMNS } from './index'

function csvField(v: string | number | undefined): string {
  const s = v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export type FitbodRow = Partial<Record<(typeof FITBOD_COLUMNS)[number], string | number>>
export type GravlRow = Partial<Record<(typeof GRAVL_COLUMNS)[number], string | number>>

function build(columns: readonly string[], rows: Record<string, string | number | undefined>[], eol: string): string {
  const lines = [columns.join(',')]
  for (const row of rows) lines.push(columns.map((c) => csvField(row[c])).join(','))
  return lines.join(eol) + eol
}

export function buildFitbodFile(rows: FitbodRow[], opts: { eol?: string; extraColumn?: boolean } = {}): string {
  const eol = opts.eol ?? '\n'
  if (!opts.extraColumn) return build(FITBOD_COLUMNS, rows, eol)
  const cols = [...FITBOD_COLUMNS, 'Extra']
  return build(cols, rows.map((r) => ({ ...r, Extra: 'x' })), eol)
}

export function buildGravlFile(rows: GravlRow[], opts: { eol?: string; bom?: boolean } = {}): string {
  const text = build(GRAVL_COLUMNS, rows, opts.eol ?? '\n')
  return opts.bom ? `﻿${text}` : text
}

/** A made-up Fitbod-style row with defaults a test can override. */
export function fRow(over: FitbodRow = {}): FitbodRow {
  return {
    Date: '2021-03-04 10:00:00 +0000',
    Exercise: 'Test Dumbbell Press',
    Reps: ' 10',
    'Weight(kg)': 10,
    'Duration(s)': 0,
    'Distance(m)': 0,
    Incline: 0,
    Resistance: 0,
    isWarmup: 'false',
    Note: '',
    multiplier: ' 2.0',
    ...over,
  }
}

/** A made-up Gravl-style row with defaults a test can override. */
export function gRow(over: GravlRow = {}): GravlRow {
  return {
    Date: '2022/05/06',
    'Start Date': '6:30 PM',
    Workout: 'Test Day',
    Source: '',
    'Workout Duration (min)': 45,
    Energy: 200,
    Exercise: 'Test Press',
    Superset: 'No',
    Set: 1,
    'Set Type': 'Normal',
    Reps: 8,
    'Weight (lb)': 25,
    'Distance (mi)': 0,
    'Set Duration (sec)': '',
    Incline: '',
    Steps: '',
    Effort: 'Ideal',
    'Workout Notes': '',
    ...over,
  }
}

/** n made-up Fitbod rows over many sessions, newest first like the real exports. */
export function bigFitbodFile(n: number): string {
  const rows: FitbodRow[] = []
  const names = ['Test Press', 'Test Row', 'Test Squat', 'Test Curl', 'Test Raise']
  for (let i = 0; i < n; i++) {
    const session = Math.floor(i / 20)
    const day = 1 + (session % 28)
    const month = 1 + (Math.floor(session / 28) % 12)
    const year = 2015 + Math.floor(session / 336)
    const stamp = `${year}-${pad(month)}-${pad(day)} 09:${pad(session % 60)}:00 +0000`
    rows.push(fRow({ Date: stamp, Exercise: names[(i % 20) % names.length], 'Weight(kg)': 5 + (i % 40) }))
  }
  rows.reverse()
  return buildFitbodFile(rows)
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
