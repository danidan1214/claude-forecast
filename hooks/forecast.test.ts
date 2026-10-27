import { expect, test } from 'claude-code/testing'

import type { Meter } from '../types'
import { addSample, bar, compact, duration, etaMs, fit, hitRatio, isExpensive, segments, turnsLeft, until, width } from './register'

const MIN = 60_000

test('duration', () => {
  expect(duration(42_000)).toBe('42s')
  expect(duration(5 * MIN)).toBe('5m')
  expect(duration(80 * MIN)).toBe('1h20m')
  expect(duration(76 * 60 * MIN)).toBe('3d4h')
})

test('compact', () => {
  expect(compact(950)).toBe('950')
  expect(compact(12_340)).toBe('12.3k')
  expect(compact(2_500_000)).toBe('2.5M')
})

test('addSample restarts after a reset and skips repeats', () => {
  const s = addSample([{ t: 0, p: 40 }], { t: MIN, p: 40 })
  expect(s.length).toBe(1)
  expect(addSample([{ t: 0, p: 80 }], { t: MIN, p: 3 })).toEqual([{ t: MIN, p: 3 }])
})

test('addSample drops samples older than 30 minutes', () => {
  const s = addSample([{ t: 0, p: 10 }, { t: 20 * MIN, p: 20 }], { t: 40 * MIN, p: 30 })
  expect(s).toEqual([{ t: 20 * MIN, p: 20 }, { t: 40 * MIN, p: 30 }])
})

test('etaMs forecasts from the pace', () => {
  // 10 points in 10 minutes from 50 %: 50 points left takes 50 minutes.
  expect(etaMs([{ t: 0, p: 40 }, { t: 10 * MIN, p: 50 }], 10 * MIN)).toBe(50 * MIN)
  expect(etaMs([{ t: 0, p: 40 }, { t: MIN, p: 50 }], MIN)).toBe(undefined)
  expect(etaMs([{ t: 0, p: 40 }], 0)).toBe(undefined)
})

test('turnsLeft averages context growth', () => {
  expect(turnsLeft([20, 30, 40], 40)).toBe(6)
  expect(turnsLeft([40], 40)).toBe(undefined)
  expect(turnsLeft([20, 30], undefined)).toBe(undefined)
})

test('hitRatio', () => {
  expect(hitRatio({ input_tokens: 10, cache_read_input_tokens: 90, cache_creation_input_tokens: 0 })).toBe(90)
  expect(hitRatio({ input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })).toBe(undefined)
})

test('isExpensive needs history and double the average', () => {
  expect(isExpensive(0.5, [0.1, 0.1, 0.1])).toBe(true)
  expect(isExpensive(0.15, [0.1, 0.1, 0.1])).toBe(false)
  expect(isExpensive(5, [0.1])).toBe(false)
})

test('bar fills by percent and clamps', () => {
  expect(bar(62)).toEqual(['━━━', '──'])
  expect(bar(0)).toEqual(['', '─────'])
  expect(bar(130)).toEqual(['━━━━━', ''])
})

const BASE: Meter = { busy: false, ctxHistory: [], fiveSamples: [], usdHistory: [] }
const FULL: Meter = {
  ...BASE,
  context: 14,
  fiveHour: 1,
  weekly: 10,
  lastResponseAt: 0,
  hitRatio: 99,
  turnTokens: 22_900,
  turnUsd: 0.38,
  repo: 'claude-forecast',
  branch: 'feat/forecast-meter',
}

const line = (columns: number) => {
  const { left, repo } = fit(segments(FULL, MIN, 60 * MIN), columns)
  return { ids: left.map(p => p.map(x => x.text).join('')), repo: repo?.map(x => x.text).join('') }
}

test('calm values hide resets, turns left and the cache countdown', () => {
  const texts = segments(FULL, MIN, 60 * MIN).flatMap(s => s.full.map(p => p.text)).join('')
  expect(texts.includes('→')).toBe(false)
  expect(texts.includes('turns')).toBe(false)
  expect(texts.includes('left')).toBe(false)
})

test('details appear once they matter', () => {
  const hot = { ...FULL, context: 60, ctxHistory: [40, 50, 60], fiveHour: 75, fiveReset: new Date(90 * MIN).toISOString(), lastResponseAt: -56 * MIN }
  const texts = segments(hot, MIN, 60 * MIN).flatMap(s => s.full.map(p => p.text)).join('')
  expect(texts.includes('~4 turns')).toBe(true)
  expect(texts.includes(`→${until(90 * MIN, MIN)}`)).toBe(true)
  expect(texts.includes('3m left')).toBe(true)
})

test('fit keeps everything on a wide terminal', () => {
  const { ids, repo } = line(200)
  expect(ids.length).toBe(5)
  expect(repo).toBe('⎇ claude-forecast:feat/forecast-meter')
})

test('fit goes lean, then drops by priority, never past the width', () => {
  for (const columns of [120, 90, 70, 50, 30]) {
    const { left, repo } = fit(segments(FULL, MIN, 60 * MIN), columns)
    const used = left.reduce((n, p) => n + width(p), 0) + 3 * Math.max(0, left.length - 1) + (repo ? 2 + width(repo) : 0)
    expect(used <= columns || left.length === 1).toBe(true)
  }
  expect(line(30).ids).toEqual(['ctx 14%', '5h 1%'])
  expect(line(12).ids).toEqual(['ctx 14%'])
  expect(line(30).repo).toBe(undefined)
})

test('until shows a clock time, with the weekday when it is not today', () => {
  const now = new Date(2026, 9, 27, 9, 0).getTime()
  expect(until(new Date(2026, 9, 27, 14, 30).getTime(), now)).toBe('14:30')
  expect(until(new Date(2026, 9, 31, 9, 5).getTime(), now)).toBe('Sat 09:05')
})

test('cache hit turns yellow under 80 %', () => {
  const low = segments({ ...FULL, hitRatio: 42 }, MIN, 60 * MIN).find(s => s.id === 'cache')!
  expect(low.full.map(p => p.text).join('')).toBe('cache hit 42%')
  expect(low.full[1]!.color).toBe('yellow')
  const ok = segments(FULL, MIN, 60 * MIN).find(s => s.id === 'cache')!
  expect(ok.full[1]!.color).toBe(undefined)
})
