import type { CardioKind } from './types'

export const KG_TO_LB = 1 / 0.45359237 // exact definition of the pound
export const MILE_TO_M = 1609.344
/** A weight above this is a data error, not a lift. */
export const MAX_WEIGHT_LB = 1000
export const MAX_REPS = 1000

/** Curly quotes to straight, every kind of space (NBSP, narrow NBSP, ...) to one space, trimmed. */
export function cleanName(s: string): string {
  return s
    .replace(/[‘’ʼ′]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[\s     ﻿]+/g, ' ')
    .trim()
}

/** Strict number: '' or garbage gives NaN (Number('') would be 0). */
export function num(s: string | undefined): number {
  if (s === undefined) return NaN
  const t = s.trim()
  return t === '' ? NaN : Number(t)
}

const CARDIO_NAME =
  /^(running|run|jogging|treadmill|walking|walk|hiking|hike|cycling|biking|elliptical|swimming|rowing machine|stair ?climber|stairmaster|jump rope)\b/i

export function isCardioName(name: string): boolean {
  return CARDIO_NAME.test(name)
}

export function cardioKind(name: string): CardioKind {
  const n = name.toLowerCase()
  if (/^(running|run|jogging|treadmill)/.test(n)) return 'run'
  if (/^(walking|walk)/.test(n)) return 'walk'
  if (/^(hiking|hike)/.test(n)) return 'hike'
  if (/^(cycling|biking)/.test(n)) return 'cycle'
  if (/^elliptical/.test(n)) return 'elliptical'
  if (/^swimming/.test(n)) return 'swim'
  if (/^rowing/.test(n)) return 'row'
  return 'other'
}

/** Column index by header name, case- and space-insensitive. Unknown extra columns are never asked for. */
export function headerIndex(fields: string[]): Map<string, number> {
  const m = new Map<string, number>()
  fields.forEach((f, i) => {
    const k = cleanName(f).toLowerCase()
    if (!m.has(k)) m.set(k, i)
  })
  return m
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
