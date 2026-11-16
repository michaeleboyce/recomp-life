import { describe, expect, it } from 'vitest'
import { csvRecords } from './csv'
import { bigFitbodFile, buildFitbodFile, buildGravlFile, fRow, gRow } from './fixtures'
import { detectFormat, parseExport, KG_TO_LB, MILE_TO_M, SESSION_GAP_SECONDS } from './index'

const lb = (kg: number) => kg * KG_TO_LB

describe('csv reader', () => {
  it('handles quotes, commas, doubled quotes, embedded newlines, CRLF and blank lines', () => {
    const text = 'a,b,c\r\n\r\n"x,y","he said ""hi""","line1\nline2"\r\nlast,,\r\n'
    const recs = [...csvRecords(text)]
    expect(recs.map((r) => r.fields)).toEqual([
      ['a', 'b', 'c'],
      ['x,y', 'he said "hi"', 'line1\nline2'],
      ['last', '', ''],
    ])
    expect(recs.map((r) => r.line)).toEqual([1, 3, 5])
  })
  it('strips a byte-order mark and flags an unterminated quote', () => {
    const recs = [...csvRecords('﻿a,"b\nc')]
    expect(recs[0].fields[0]).toBe('a')
    expect(recs[0].malformed).toBe(true)
  })
})

describe('format detection', () => {
  it('recognises both headers, tolerating extra columns and a BOM', () => {
    expect(detectFormat(buildFitbodFile([fRow()]))).toBe('fitbod')
    expect(detectFormat(buildFitbodFile([fRow()], { extraColumn: true }))).toBe('fitbod')
    expect(detectFormat(buildGravlFile([gRow()], { bom: true }))).toBe('gravl')
  })
  it('returns an error result for anything else', () => {
    const r = parseExport('name,value\nx,1\n')
    expect(r.app).toBe('unknown')
    expect(r.error).toBeTruthy()
    expect(parseExport('').error).toBeTruthy()
  })
})

describe('Fitbod-style parser', () => {
  it('converts kilograms exactly and reads the multiplier as implements', () => {
    const r = parseExport(
      buildFitbodFile([
        fRow({ Exercise: 'Test Dumbbell Bench Press', 'Weight(kg)': 13.6, multiplier: ' 2.0' }),
        fRow({ Exercise: 'Test Barbell Bench Press', 'Weight(kg)': 40, multiplier: ' 1.0' }),
      ]),
    )
    expect(r.rejected).toEqual([])
    const [a, b] = r.sessions[0].sets
    expect(a.weightPerImplementLb).toBe(lb(13.6)) // not rounded
    expect(a.implementCount).toBe(2)
    expect(a.multiplierRaw).toBe(2)
    expect(b.implementCount).toBe(1)
    expect(lb(0.45359237)).toBeCloseTo(1, 12)
  })

  it('treats 4 as two dumbbells and 0 as weight that adds no load, keeping the raw value', () => {
    const r = parseExport(
      buildFitbodFile([
        fRow({ Exercise: 'Test Dumbbell Lunge', multiplier: ' 4.0' }),
        fRow({ Exercise: 'Test Assisted Pull Up', multiplier: ' 0.0' }),
        fRow({ Exercise: 'Test Odd', multiplier: ' 3.0' }),
      ]),
    )
    const [lunge, assisted, odd] = r.sessions[0].sets
    expect([lunge.implementCount, lunge.multiplierRaw]).toEqual([2, 4])
    expect([assisted.weightCountsAsLoad, assisted.multiplierRaw]).toEqual([false, 0])
    expect([odd.implementCount, odd.multiplierRaw]).toEqual([null, 3])
  })

  it('groups by time stamp, sorts newest-first files, keeps set order and numbers sets per exercise', () => {
    const t1 = '2021-03-04 10:00:00 +0000'
    const t2 = '2021-03-04 10:00:20 +0000' // seconds later: same session
    const t3 = '2021-03-04 15:00:00 +0000' // hours later: new session
    const rows = [
      fRow({ Date: t3, Exercise: 'Test Row', Reps: 5 }),
      fRow({ Date: t2, Exercise: 'Test Press', Reps: 9, 'Weight(kg)': 30 }),
      fRow({ Date: t1, Exercise: 'Test Press', Reps: 10, 'Weight(kg)': 10 }),
      fRow({ Date: t1, Exercise: 'Test Press', Reps: 11, 'Weight(kg)': 20 }),
    ]
    const r = parseExport(buildFitbodFile(rows))
    expect(r.sessions).toHaveLength(2)
    const [first, second] = r.sessions
    expect(first.start).toBe('2021-03-04T10:00:00.000Z')
    expect(first.end).toBe('2021-03-04T10:00:20.000Z')
    expect(first.sets.map((s) => [s.setOrder, s.reps])).toEqual([[1, 10], [2, 11], [3, 9]])
    expect(second.sets).toHaveLength(1)
    expect(SESSION_GAP_SECONDS).toBe(1800)
  })

  it('applies the time-zone offset', () => {
    const r = parseExport(buildFitbodFile([fRow({ Date: '2021-03-04 10:00:00 -0500' })]))
    expect(r.sessions[0].start).toBe('2021-03-04T15:00:00.000Z')
  })

  it('marks warm-ups, turns timed holds into duration sets and cardio into cardio entries', () => {
    const r = parseExport(
      buildFitbodFile([
        fRow({ isWarmup: 'true' }),
        fRow({ Exercise: 'Test Plank', Reps: 0, 'Weight(kg)': 0, 'Duration(s)': 45, multiplier: ' 1.0' }),
        fRow({ Date: '2021-03-05 08:00:00 +0000', Exercise: 'Running', Reps: 0, 'Weight(kg)': 0, 'Duration(s)': 1500, 'Distance(m)': 4000, multiplier: ' 0.0' }),
        fRow({ Date: '2021-03-06 08:00:00 +0000', Exercise: 'Walking', Reps: 0, 'Weight(kg)': 0, 'Duration(s)': 600, 'Distance(m)': 0, multiplier: ' 0.0' }),
      ]),
    )
    const sets = r.sessions[0].sets
    expect(sets[0].role).toBe('warmup')
    expect(sets[1]).toMatchObject({ reps: null, durationSec: 45 })
    expect(r.cardio.map((c) => [c.kind, c.durationSec, c.distanceM])).toEqual([
      ['run', 1500, 4000],
      ['walk', 600, null],
    ])
    expect(r.sessions).toHaveLength(1)
  })

  it('reports impossible rows with a reason and still parses the rest', () => {
    const r = parseExport(
      buildFitbodFile([
        fRow({ Reps: -3 }),
        fRow({ 'Weight(kg)': 600 }), // about 1,300 lb
        fRow({ Date: 'not a date' }),
        fRow({ Exercise: '' }),
        fRow({ isWarmup: 'maybe' }),
        fRow({ Reps: 12 }),
      ]),
    )
    expect(r.sessions[0].sets).toHaveLength(1)
    expect(r.rejected.map((x) => x.reason)).toEqual([
      'reps out of range',
      'weight over 1,000 lb',
      'unreadable date',
      'missing exercise name',
      'unreadable warm-up flag',
    ])
    expect(r.rejected.map((x) => x.rowNumber)).toEqual([2, 3, 4, 5, 6])
    expect(r.rowCount).toBe(6)
  })

  it('copes with quoted names containing commas, CRLF, extra columns and blank lines', () => {
    const text = buildFitbodFile([fRow({ Exercise: 'Test Press, Wide', Note: 'felt "good", really' })], {
      eol: '\r\n',
      extraColumn: true,
    })
    const r = parseExport(`${text}\r\n\r\n`)
    expect(r.rejected).toEqual([])
    expect(r.sessions[0].sets[0].exerciseName).toBe('Test Press, Wide')
    expect(r.sessions[0].notes).toBe('felt "good", really')
  })

  it('gives rows too short for the header a reason', () => {
    const r = parseExport(`${buildFitbodFile([fRow()])}2021-01-01 10:00:00 +0000,Short\n`)
    expect(r.rejected[0].reason).toBe('too few columns')
  })

  it('keeps identical repeated rows as separate sets with distinct, repeatable ids', () => {
    const text = buildFitbodFile([fRow(), fRow(), fRow()])
    const a = parseExport(text)
    const b = parseExport(text.replace(/\n/g, '\r\n'))
    const ids = a.sessions[0].sets.map((s) => s.id)
    expect(new Set(ids).size).toBe(3)
    expect(b.sessions[0].sets.map((s) => s.id)).toEqual(ids)
    expect(b.sessions[0].id).toBe(a.sessions[0].id)
  })
})

describe('Gravl parser', () => {
  it('groups by date, start time and workout; maps set types and effort words', () => {
    const r = parseExport(
      buildGravlFile(
        [
          gRow({ Set: 1, 'Set Type': 'Warmup', Effort: 'Easy', 'Weight (lb)': 10 }),
          gRow({ Set: 2, 'Set Type': 'Normal', Effort: 'Hard' }),
          gRow({ Set: 3, 'Set Type': 'Dropset', Effort: '' }),
          gRow({ Workout: 'Other Day', Exercise: 'Test Curl', Set: 1 }),
        ],
        { bom: true },
      ),
    )
    expect(r.rejected).toEqual([])
    expect(r.sessions).toHaveLength(2)
    const s = r.sessions[0]
    expect(s.title).toBe('Test Day')
    expect(s.start).toBe('2022-05-06T18:30:00')
    expect(s.startIsLocal).toBe(true)
    expect(s.end).toBe('2022-05-06T19:15:00')
    expect(s.sets.map((x) => [x.role, x.effort, x.setOrder])).toEqual([
      ['warmup', 'Easy', 1],
      ['work', 'Hard', 2],
      ['drop', null, 3],
    ])
    expect(s.sets[0].weightPerImplementLb).toBe(10)
    expect(s.sets[0].implementCount).toBeNull()
  })

  it('reads morning times and tidies curly apostrophes and non-breaking spaces in names', () => {
    const r = parseExport(
      buildGravlFile([
        gRow({ 'Start Date': '9:05 AM', Workout: 'Mike’s Push', Exercise: 'Farmer’s Carry' }),
        gRow({ 'Start Date': '12:10 AM', Workout: 'Night', Exercise: 'Test Press' }),
      ]),
    )
    expect(r.sessions[0].start).toBe('2022-05-06T09:05:00')
    expect(r.sessions[0].title).toBe("Mike's Push")
    expect(r.sessions[0].sets[0].exerciseName).toBe("Farmer's Carry")
    expect(r.sessions[1].start).toBe('2022-05-06T00:10:00')
  })

  it('turns watch-sourced cardio into cardio entries in metres and keeps timed holds as sets', () => {
    const r = parseExport(
      buildGravlFile([
        gRow({
          Workout: 'Test Watch - Walking',
          Source: 'Test Watch',
          Exercise: 'Walking',
          Set: 0,
          Reps: 0,
          'Weight (lb)': 0,
          'Distance (mi)': 1.5,
          'Set Duration (sec)': 1800,
          Effort: 'Easy',
        }),
        gRow({ Exercise: 'Test Plank', Reps: 0, 'Weight (lb)': 0, 'Set Duration (sec)': 60 }),
      ]),
    )
    expect(r.cardio).toHaveLength(1)
    expect(r.cardio[0]).toMatchObject({ kind: 'walk', durationSec: 1800, startIsLocal: true })
    expect(r.cardio[0].distanceM).toBeCloseTo(1.5 * MILE_TO_M, 9)
    expect(r.sessions).toHaveLength(1)
    expect(r.sessions[0].sets[0]).toMatchObject({ reps: null, durationSec: 60 })
  })

  it('rejects unknown set types and impossible values with reasons', () => {
    const r = parseExport(
      buildGravlFile([
        gRow({ 'Set Type': 'Mystery' }),
        gRow({ Reps: -1 }),
        gRow({ 'Weight (lb)': 1500 }),
        gRow({ Date: '2022-13-45' }),
        gRow({ Reps: 5 }),
      ]),
    )
    expect(r.rejected.map((x) => x.reason)).toEqual([
      'unknown set type',
      'reps out of range',
      'weight over 1,000 lb',
      'unreadable date or start time',
    ])
    expect(r.sessions[0].sets).toHaveLength(1)
  })

  it('produces identical ids on a second parse and with Windows line endings', () => {
    const rows = [gRow({ Set: 1 }), gRow({ Set: 1 }), gRow({ Set: 2 })]
    const a = parseExport(buildGravlFile(rows))
    const b = parseExport(buildGravlFile(rows, { eol: '\r\n', bom: true }))
    expect(b.sessions.map((s) => s.id)).toEqual(a.sessions.map((s) => s.id))
    expect(b.sessions[0].sets.map((s) => s.id)).toEqual(a.sessions[0].sets.map((s) => s.id))
    expect(new Set(a.sessions[0].sets.map((s) => s.id)).size).toBe(3)
  })
})

describe('performance (I13)', () => {
  it('parses 12,000 made-up rows well under a second', () => {
    const text = bigFitbodFile(12000)
    const t0 = performance.now()
    const r = parseExport(text)
    const ms = performance.now() - t0
    expect(r.rejected).toEqual([])
    expect(r.sessions.reduce((n, s) => n + s.sets.length, 0)).toBe(12000)
    expect(new Set(r.sessions.flatMap((s) => s.sets.map((x) => x.id))).size).toBe(12000)
    expect(ms).toBeLessThan(1000)
  })
})
