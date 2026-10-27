import { atom, read, update } from 'claude-code'
import type { CoreEngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Meter, Sample } from '../types'

const EMPTY: Meter = { busy: false, ctxHistory: [], fiveSamples: [], usdHistory: [] }
const meter = atom({ plugin: 'forecast-meter', key: 'meter' } as const, EMPTY)
const tick = atom({ plugin: 'forecast-meter', key: 'tick' } as const, 0)

const MIN = 60_000
// Older samples describe a pace the person already left behind.
const RATE_WINDOW = 30 * MIN
const MIN_SPAN = 2 * MIN
const KEEP = 6

export function duration(ms: number): string {
  if (ms < MIN) return `${Math.max(0, Math.round(ms / 1000))}s`
  const m = Math.round(ms / MIN)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h${String(m % 60).padStart(2, '0')}m` : `${Math.floor(h / 24)}d${h % 24}h`
}

export function compact(n: number): string {
  return n < 1000 ? String(n) : n < 1_000_000 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1_000_000).toFixed(1)}M`
}

// A drop in percent means the window reset, so the old pace no longer applies.
export function addSample(samples: Sample[], s: Sample): Sample[] {
  const last = samples[samples.length - 1]
  if (last && s.p < last.p) return [s]
  if (last && s.p === last.p) return samples
  return [...samples, s].filter(x => s.t - x.t <= RATE_WINDOW)
}

export function etaMs(samples: Sample[], now: number): number | undefined {
  const first = samples[0]
  const last = samples[samples.length - 1]
  if (!first || !last || last.t - first.t < MIN_SPAN) return undefined
  const rate = (last.p - first.p) / (last.t - first.t)
  if (rate <= 0) return undefined
  return Math.max(0, (100 - last.p) / rate - (now - last.t))
}

export function turnsLeft(history: number[], current?: number): number | undefined {
  if (current === undefined) return undefined
  const deltas = history.slice(1).map((p, i) => p - history[i]!).filter(d => d > 0)
  if (deltas.length === 0) return undefined
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length
  return Math.floor((100 - current) / avg)
}

export function hitRatio(u: { input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }): number | undefined {
  const total = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
  return total === 0 ? undefined : Math.round((u.cache_read_input_tokens / total) * 100)
}

export function isExpensive(usd: number | undefined, history: number[]): boolean {
  if (usd === undefined || history.length < 3) return false
  return usd > (2 * history.reduce((a, b) => a + b, 0)) / history.length
}

export function layout(columns: number) {
  return { weekly: columns >= 110, resets: columns >= 110, repo: columns >= 90 }
}

function pick(limits: SessionRateLimit[], kind: string) {
  return limits.find(l => l.kind === kind)
}

function pct(p?: number) {
  return p === undefined ? '—' : `${Math.round(p)}%`
}

function heat(p?: number) {
  return p === undefined ? undefined : p >= 90 ? 'red' : p >= 70 ? 'yellow' : 'green'
}

function push<T>(list: T[], x: T): T[] {
  return [...list, x].slice(-KEEP)
}

async function refreshRepo($: Pick<CoreEngineInterface, 'process' | 'state'>, cwd?: string) {
  const r = await $.process.run(['git', 'rev-parse', '--show-toplevel', '--abbrev-ref', 'HEAD'], { cwd, timeoutMs: 3000 }).catch(() => undefined)
  if (!r || r.exitCode !== 0) return
  const [top = '', branch] = r.stdout.trim().split('\n')
  await update($, meter, m => ({ ...m, repo: top.split('/').pop(), branch }))
}

export const register: Register = (on, options) => {
  const ttlMs = options.cacheTtl === '5m' ? 5 * MIN : 60 * MIN
  let costAtStart: number | undefined
  let warnedCacheFor: number | undefined
  let warnedFiveFor: string | undefined

  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await refreshRepo($)
    $.clock.every(1000, async () => {
      await update($, tick, t => t + 1)
      const m = await read($, meter)
      if (m.busy || m.lastResponseAt === undefined || warnedCacheFor === m.lastResponseAt) return
      const left = ttlMs - ((await $.clock.now()) - m.lastResponseAt)
      if (left > 0 && left <= MIN) {
        warnedCacheFor = m.lastResponseAt
        $.ui.toast(`Prompt cache expires in ${duration(left)}: reply now or the next turn re-writes it`)
      }
    })
    return ran
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      costAtStart = (await $.session.usage()).cost?.usd
      await update($, meter, m => ({ ...m, busy: true }))
    }
    return next(e)
  })

  // Every main-loop response refreshes the cache entry the TTL counts from.
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    if (e.agentId === undefined && r.usage) {
      const lastResponseAt = await $.clock.now()
      await update($, meter, m => ({ ...m, lastResponseAt }))
    }
    return r
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if ((e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'NotebookEdit') && !ran.isError) {
      const path = e.tool === 'NotebookEdit' ? e.notebook_path : e.file_path
      await refreshRepo($, path.slice(0, path.lastIndexOf('/')) || '/')
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const u = e.usage
      const usd = (await $.session.usage()).cost?.usd
      const turnUsd = usd !== undefined && costAtStart !== undefined ? usd - costAtStart : undefined
      await update($, meter, m => ({
        ...m,
        busy: false,
        turnTokens: u ? u.input_tokens + u.output_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens : undefined,
        hitRatio: u ? hitRatio(u) : m.hitRatio,
        turnUsd,
        usdHistory: turnUsd === undefined ? m.usdHistory : push(m.usdHistory, turnUsd),
      }))
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const now = await $.clock.now()
    const five = pick(e.rateLimits, 'five_hour')
    const week = pick(e.rateLimits, 'seven_day')
    const m = await update($, meter, m => ({
      ...m,
      context: e.context.percent,
      ctxHistory: e.context.percent === undefined ? m.ctxHistory : push(m.ctxHistory, e.context.percent),
      fiveHour: five?.percentUsed,
      fiveReset: five?.resetsAt,
      fiveSamples: five ? addSample(m.fiveSamples, { t: now, p: five.percentUsed }) : m.fiveSamples,
      weekly: week?.percentUsed,
      weeklyReset: week?.resetsAt,
    }))
    const eta = etaMs(m.fiveSamples, now)
    const resetIn = m.fiveReset ? Date.parse(m.fiveReset) - now : undefined
    if (eta !== undefined && resetIn !== undefined && eta < resetIn && warnedFiveFor !== m.fiveReset) {
      warnedFiveFor = m.fiveReset
      $.ui.toast(`At this pace the 5h limit runs out in ~${duration(eta)}, ${duration(resetIn - eta)} before it resets`)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    await read($, tick)
    const m = await read($, meter)
    const now = await $.clock.now()
    const L = layout(e.props.bodyColumns ?? e.viewport?.columns ?? 120)

    const turns = turnsLeft(m.ctxHistory, m.context)
    const eta = etaMs(m.fiveSamples, now)
    const resetIn = m.fiveReset ? Date.parse(m.fiveReset) - now : undefined
    const runsOut = eta !== undefined && resetIn !== undefined && eta < resetIn
    const cacheLeft = m.lastResponseAt === undefined ? undefined : ttlMs - (now - m.lastResponseAt)

    return (
      <Box gap={2}>
        <Text>
          ctx <Text color={heat(m.context)}>{pct(m.context)}</Text>
          {turns !== undefined && <Text dimColor> ~{turns}t</Text>}
        </Text>
        {m.fiveHour !== undefined && (
          <Text>
            5h <Text color={heat(m.fiveHour)}>{pct(m.fiveHour)}</Text>
            {runsOut ? <Text color="red" bold> out ~{duration(eta!)}</Text> : eta !== undefined && <Text color="green"> ✓</Text>}
            {L.resets && resetIn !== undefined && <Text dimColor> ↻{duration(resetIn)}</Text>}
          </Text>
        )}
        {L.weekly && m.weekly !== undefined && (
          <Text>
            wk <Text color={heat(m.weekly)}>{pct(m.weekly)}</Text>
            {L.resets && m.weeklyReset && <Text dimColor> ↻{duration(Date.parse(m.weeklyReset) - now)}</Text>}
          </Text>
        )}
        {cacheLeft !== undefined && (
          <Text>
            cache {m.hitRatio !== undefined && <Text dimColor>{m.hitRatio}% </Text>}
            {m.busy ? <Text color="green">warm</Text> : cacheLeft > 0 ? <Text color={cacheLeft <= MIN ? 'red' : cacheLeft <= 5 * MIN ? 'yellow' : 'green'}>⏳{duration(cacheLeft)}</Text> : <Text color="gray">cold</Text>}
          </Text>
        )}
        {m.turnTokens !== undefined && (
          <Text color={isExpensive(m.turnUsd, m.usdHistory.slice(0, -1)) ? 'yellow' : undefined} dimColor={!isExpensive(m.turnUsd, m.usdHistory.slice(0, -1))}>
            last +{compact(m.turnTokens)}
            {m.turnUsd !== undefined && ` $${m.turnUsd.toFixed(2)}`}
          </Text>
        )}
        {L.repo && m.repo && <Text color="cyan">⎇ {m.repo}:{m.branch}</Text>}
      </Box>
    )
  })
}
