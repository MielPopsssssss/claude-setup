import type { ShipTask } from '../types'

/** How a phase reaches its agents: one call, a bounded loop, the frozen-test oracle, or several at once. */
export type Link = 'call' | 'loop' | 'oracle' | 'parallel'

/** The /ship phases in pipeline order, as `state.md` names them. */
export const PHASES: { id: string; label: string; agents?: string[]; link?: Link }[] = [
  { id: '0', label: 'Profils' },
  { id: '1', label: 'Demande et tri' },
  { id: '2', label: 'Inventaire', agents: ['ship-scout'], link: 'call' },
  { id: '3', label: 'Plan', agents: ['ship-plan-critic'], link: 'loop' },
  { id: '4', label: 'Validation (toi)' },
  { id: '4b', label: 'Autopilote' },
  { id: '5', label: 'Branche' },
  { id: '6', label: 'Tests figés', agents: ['ship-test-auditor'], link: 'loop' },
  { id: '7', label: 'Code' },
  { id: '8', label: 'Vérification', link: 'oracle' },
  { id: '9', label: 'Revues', agents: ['ship-security', 'ship-pm', 'code-review'], link: 'parallel' },
  { id: '10', label: 'Correctifs' },
  { id: '11', label: 'Porte complète' },
  { id: '12', label: 'PR' },
]

/** One saturated color per agent type, so a node reads the same in the graph and in the message list. */
export const AGENT_COLOR: Record<string, string> = {
  'ship-scout': '#06b6d4',
  'ship-plan-critic': '#a855f7',
  'ship-test-auditor': '#3b82f6',
  'ship-security': '#ef4444',
  'ship-pm': '#ec4899',
  'code-review': '#f97316',
}
export const agentColor = (type: string) => AGENT_COLOR[type] ?? '#9ca3af'

/** A verdict's color: green when the agent let the work through, amber when it sent it back. */
export const verdictColor = (v?: string) => (v == null ? undefined : /PASS|COMPLETE|SHIP/.test(v) ? '#22c55e' : '#f59e0b')

const ids = (text: string, mark: string) =>
  [...text.matchAll(new RegExp(`^- \\[${mark}\\] (\\d+b?)\\b`, 'gm'))].map(m => m[1] ?? '').filter(Boolean)

/** Reads the `state.md` format the /ship skill writes. Unknown lines are ignored. */
export function parseState(text: string, slug: string, mtimeMs: number): ShipTask {
  const done = /^DONE\b\s*[—-]?\s*(.*)$/m.exec(text)
  const blocked = /^BLOCKED\b\s*[—-]?\s*(.*)$/m.exec(text)
  return {
    slug: /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? slug,
    size: /^taille:\s*(\S+)/m.exec(text)?.[1] ?? '?',
    risks: /^risques:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? '',
    done: ids(text, 'x'),
    skipped: ids(text, '-'),
    status: blocked ? 'blocked' : done ? 'done' : 'running',
    note: (blocked ?? done)?.[1]?.trim() ?? '',
    mtimeMs,
  }
}

/** The first phase neither done nor skipped; null once all are. */
export function currentPhase(task: ShipTask): string | null {
  if (task.status !== 'running') return null
  return PHASES.find(p => !task.done.includes(p.id) && !task.skipped.includes(p.id))?.id ?? null
}

export const verdictOf = (answer: string) => /VERDICT:\s*([A-Z_]+)/.exec(answer)?.[1]

export const kTokens = (n?: number) => (n == null ? '–' : n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`)
