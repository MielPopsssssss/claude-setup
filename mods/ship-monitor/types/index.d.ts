export type ShipTask = {
  slug: string
  size: string
  risks: string
  done: string[]
  skipped: string[]
  status: 'running' | 'done' | 'blocked'
  note: string
  mtimeMs: number
}

export type AgentMsg = {
  agentId: string
  type: string
  description: string
  prompt: string
  startedAt: number
  answer?: string
  verdict?: string
  tokensIn?: number
  tokensOut?: number
  durationMs?: number
}

export type ShipUsage = { usd?: number; contextPercent?: number; contextTokens?: number }

declare module 'claude-code' {
  interface PluginState {
    'ship-monitor': {
      task: Shaped<ShipTask | null>
      agents: Shaped<AgentMsg[]>
      usage: ShipUsage | null
      expanded: string | null
    }
  }
}
