/**
 * I12 privacy guard. The repository is public; real exports must never be
 * pasted into it. This fails if any file under src/ or docs/ contains
 *   - either export's header line followed by a line that looks like data
 *     (a date and numbers), or
 *   - the private data folder's name followed by a data row.
 *
 * How made-up fixtures stay clear of it: src/lib/import/parse/fixtures.ts
 * only ever builds a header at run time by joining the column-name list, and
 * builds rows from objects, so no file contains a header line or a data row
 * as text. This file likewise builds its own positive examples at run time.
 * The guard needs no allow-list.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FITBOD_COLUMNS, GRAVL_COLUMNS } from './parse'

const ROOT = path.resolve(__dirname, '../../..')
const SKIP_DIRS = new Set(['node_modules', '.next', '.git'])
const BINARY = /\.(png|jpe?g|gif|webp|ico|icns|woff2?|ttf|otf|mp4|mov|webm|pdf|zip|gz|bin|wasm)$/i
const MAX_BYTES = 8 * 1024 * 1024

const squash = (s: string) => s.replace(/﻿/g, '').replace(/[\s"']/g, '').toLowerCase()
const HEADERS = [FITBOD_COLUMNS, GRAVL_COLUMNS].map((c) => squash(c.join(',')))
// the private folder's name, assembled so this file does not contain it whole
const PRIVATE_FOLDER = ['recomp-life', 'private', 'data'].join('-')

/** A date followed by at least three more comma-separated values, one of them a number. */
const DATA_ROW = /(?:^|["'\s,])\d{4}[-/]\d{2}[-/]\d{2}[^,\n]*(?:,[^,\n]*){3,}/

function lookLikeData(lines: string[], from: number, tail: string): boolean {
  if (DATA_ROW.test(tail)) return true
  for (let k = from; k < Math.min(lines.length, from + 3); k++) {
    if (DATA_ROW.test(lines[k])) return true
  }
  return false
}

/** Returns a description of each violation in a file's text. */
export function findLeaks(text: string): string[] {
  const out: string[] = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const squashed = squash(lines[i])
    for (const h of HEADERS) {
      if (!squashed.includes(h)) continue
      // data on the following lines, or after the header on the same line (header quoted inside a string)
      if (lookLikeData(lines, i + 1, lines[i])) out.push(`header followed by data at line ${i + 1}`)
    }
    if (lines[i].includes(PRIVATE_FOLDER) && lookLikeData(lines, i, '')) {
      out.push(`private folder path near a data row at line ${i + 1}`)
    }
  }
  return out
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = path.join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) yield* walk(full)
    else if (st.isFile() && !BINARY.test(name) && st.size <= MAX_BYTES) yield full
  }
}

describe('privacy guard (I12)', () => {
  it('catches a header followed by a data row (built at run time)', () => {
    for (const cols of [FITBOD_COLUMNS, GRAVL_COLUMNS]) {
      const header = cols.join(',')
      const row = ['2020-01-02 10:00:00 +0000', ...cols.slice(1).map((_, i) => String(i + 1))].join(',')
      expect(findLeaks(`${header}\n${row}\n`)).not.toEqual([])
      expect(findLeaks(`﻿"${cols.join('","')}"\r\n${row}\r\n`)).not.toEqual([])
    }
  })

  it('catches the private folder path next to a data row', () => {
    const row = '2020-01-02,Some Lift,10,20,0,0,0,0,false,,2'
    expect(findLeaks(`/Users/x/${PRIVATE_FOLDER}/imports/file.csv\n${row}\n`)).not.toEqual([])
  })

  it('does not flag a header alone, prose, or the helper-style column lists', () => {
    expect(findLeaks(FITBOD_COLUMNS.join(','))).toEqual([])
    expect(findLeaks(`The ${PRIVATE_FOLDER} folder holds the exports.\n\nNothing else here.`)).toEqual([])
    expect(findLeaks("export const COLUMNS = ['Date', 'Exercise']")).toEqual([])
  })

  it('finds nothing in src/ or docs/', () => {
    const offenders: string[] = []
    for (const dir of ['src', 'docs']) {
      const base = path.join(ROOT, dir)
      for (const file of walk(base)) {
        const hits = findLeaks(readFileSync(file, 'utf8'))
        if (hits.length) offenders.push(`${path.relative(ROOT, file)}: ${hits.join('; ')}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
