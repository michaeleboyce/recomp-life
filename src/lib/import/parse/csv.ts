/**
 * Minimal streaming CSV reader. A generator over the one input string: it
 * never builds an array of lines, so only the current record is materialised.
 * Handles quoted fields (commas, doubled quotes, embedded newlines), CRLF,
 * a leading byte-order mark and blank lines (skipped, but still counted in
 * the line numbers).
 */

export interface CsvRecord {
  fields: string[]
  /** 1-based physical line on which the record starts. */
  line: number
  /** true when a quoted field was never closed. */
  malformed: boolean
}

export function* csvRecords(text: string): Generator<CsvRecord> {
  const n = text.length
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0
  let line = 1
  while (i < n) {
    const startLine = line
    const fields: string[] = []
    let malformed = false
    let atRecordEnd = false
    while (!atRecordEnd) {
      if (text.charCodeAt(i) === 34 /* " */) {
        i++
        let value = ''
        let segStart = i
        let closed = false
        while (i < n) {
          const c = text.charCodeAt(i)
          if (c === 34) {
            if (text.charCodeAt(i + 1) === 34) {
              value += text.slice(segStart, i + 1)
              i += 2
              segStart = i
              continue
            }
            value += text.slice(segStart, i)
            i++
            closed = true
            break
          }
          if (c === 10) line++
          i++
        }
        if (!closed) {
          value += text.slice(segStart, i)
          malformed = true
        }
        // keep stray characters between the closing quote and the delimiter
        const s = i
        while (i < n) {
          const c = text.charCodeAt(i)
          if (c === 44 || c === 10 || c === 13) break
          i++
        }
        fields.push(value + text.slice(s, i))
      } else {
        const s = i
        while (i < n) {
          const c = text.charCodeAt(i)
          if (c === 44 || c === 10 || c === 13) break
          i++
        }
        fields.push(text.slice(s, i))
      }
      const c = text.charCodeAt(i)
      if (c === 44) {
        i++
        if (i >= n) {
          fields.push('')
          atRecordEnd = true
        }
      } else {
        if (c === 13) i++
        if (text.charCodeAt(i) === 10) i++
        line++
        atRecordEnd = true
      }
    }
    if (fields.length === 1 && fields[0] === '' && !malformed) continue // blank line
    yield { fields, line: startLine, malformed }
  }
}
