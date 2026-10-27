import { expect, test } from 'claude-code/testing'

import { addSample, compact, duration, etaMs, hitRatio, isExpensive, layout, turnsLeft } from './register'

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

test('layout drops parts as the terminal narrows', () => {
  expect(layout(120)).toEqual({ weekly: true, resets: true, repo: true })
  expect(layout(100)).toEqual({ weekly: false, resets: false, repo: true })
  expect(layout(80)).toEqual({ weekly: false, resets: false, repo: false })
})
