/**
 * I12 privacy guard. The repository is public; real exports must never be
 * pasted into it. This fails if any file under src/, docs/ or scripts/, or any
 * file at the repository root, contains
 *   - either export's header line followed by a line that looks like data
 *     (a date and numbers), or
 *   - the private data folder's name followed by a data row.
 *
 * How made-up fixtures stay clear of it: src/lib/import/parse/fixtures.ts
 * only ever builds a header at run time by joining the column-name list, and
 * builds rows from objects, so no file contains a header line or a data row
 * as text. This file likewise builds its own positive examples at run time.
 * The guard needs no allow-list. Environment files (.env*) are never read: they
 * hold secrets, not exports, and are not committed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FITBOD_COLUMNS, GRAVL_COLUMNS } from './parse'

const ROOT = path.resolve(__dirname, '../../..')
const SKIP_DIRS = new Set(['node_modules', '.next', '.git'])
const BINARY = /\.(png|jpe?g|gif|webp|ico|icns|woff2?|ttf|otf|mp4|mov|webm|pdf|zip|gz|bin|wasm)$/i
const MAX_BYTES = 8 * 1024 * 1024
/** Environment files hold secrets and are never committed; the guard does not open them. */
const ENV_FILE = /^\.env/

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

const scannable = (name: string, size: number) => !ENV_FILE.test(name) && !BINARY.test(name) && size <= MAX_BYTES

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = path.join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) yield* walk(full)
    else if (st.isFile() && scannable(name, st.size)) yield full
  }
}

/** The files directly at the repository root (not its folders). */
function* rootFiles(): Generator<string> {
  for (const name of readdirSync(ROOT)) {
    const full = path.join(ROOT, name)
    const st = statSync(full)
    if (st.isFile() && scannable(name, st.size)) yield full
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

  it('finds nothing in src/, docs/, scripts/ or the files at the repository root', () => {
    const files = [...['src', 'docs', 'scripts'].flatMap((dir) => [...walk(path.join(ROOT, dir))]), ...rootFiles()]
    // The scan reaches the preload script and the root's own files.
    const scanned = new Set(files.map((file) => path.relative(ROOT, file)))
    for (const expected of ['scripts/import-history.ts', 'package.json', 'CLAUDE.md']) {
      expect(scanned.has(expected), expected).toBe(true)
    }
    expect([...scanned].some((file) => ENV_FILE.test(path.basename(file)))).toBe(false)
    const offenders: string[] = []
    for (const file of files) {
      const hits = findLeaks(readFileSync(file, 'utf8'))
      if (hits.length) offenders.push(`${path.relative(ROOT, file)}: ${hits.join('; ')}`)
    }
    expect(offenders).toEqual([])
  })
})
