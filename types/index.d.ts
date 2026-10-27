export type Sample = { t: number; p: number }

export type Meter = {
  busy: boolean
  context?: number
  ctxHistory: number[]
  fiveHour?: number
  fiveReset?: string
  fiveSamples: Sample[]
  weekly?: number
  weeklyReset?: string
  lastResponseAt?: number
  hitRatio?: number
  turnTokens?: number
  turnUsd?: number
  usdHistory: number[]
  repo?: string
  branch?: string
}

declare module 'claude-code' {
  interface PluginState {
    'forecast-meter': { meter: Meter; tick: number }
  }
}
