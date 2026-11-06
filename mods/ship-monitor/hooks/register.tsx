import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { AgentMsg, ShipTask, ShipUsage } from '../types'
import { PHASES, agentColor, currentPhase, kTokens, parseState, verdictColor, verdictOf } from './parse'

const PANE = 'ship-monitor'
const task = atom({ plugin: 'ship-monitor', key: 'task' } as const, null as ShipTask | null, { shape: 'task-1' })
const agents = atom({ plugin: 'ship-monitor', key: 'agents' } as const, [] as AgentMsg[], { shape: 'agents-1' })
const usage = atom({ plugin: 'ship-monitor', key: 'usage' } as const, null as ShipUsage | null)
const expanded = atom({ plugin: 'ship-monitor', key: 'expanded' } as const, null as string | null)

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const firstLines = (s: string, n: number) => s.split('\n').filter(l => l.trim()).slice(0, n)

/** The most recently touched `.ship/<slug>/state.md` of the repo the session runs in. */
async function locate($: EngineInterface): Promise<ShipTask | null> {
  const cwd = await $.session.cwd()
  const git = await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, timeoutMs: 3000 })
  if (git.exitCode !== 0) return null
  const root = `${git.stdout.trim().replace(/\/\.git\/?$/, '')}/.ship`
  let best: { slug: string; path: string; mtimeMs: number } | null = null
  try {
    for (const entry of await $.fs.list(root)) {
      if (entry.kind !== 'dir') continue
      const path = `${root}/${entry.name}/state.md`
      try {
        const { mtimeMs } = await $.fs.stat(path)
        if (!best || mtimeMs > best.mtimeMs) best = { slug: entry.name, path, mtimeMs }
      } catch {
        // a task folder without state.md yet
      }
    }
  } catch {
    return null
  }
  if (!best) return null
  const text = await $.fs.read(best.path)
  return parseState(typeof text === 'string' ? text : '', best.slug, best.mtimeMs)
}

async function refresh($: EngineInterface) {
  const found = await locate($).catch(() => null)
  const was = await read($, task)
  if (JSON.stringify(found) !== JSON.stringify(was)) await update($, task, () => found)
  const u = await $.session.usage()
  const next: ShipUsage = {
    usd: u.cost ? Math.round(u.cost.usd * 100) / 100 : undefined,
    contextPercent: u.context.percent == null ? undefined : Math.round(u.context.percent),
    contextTokens: u.context.tokens,
  }
  const prev = await read($, usage)
  if (JSON.stringify(prev) !== JSON.stringify(next)) await update($, usage, () => next)
  return found
}

const openPane = ($: EngineInterface) => void $.ui.open({ id: PANE, title: '/ship' }).catch(() => undefined)

export const register: Register = on => {
  // The slug of the last task seen, so a task that appears mid-session opens the pane once, not every tick.
  let seen: string | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ship-monitor', description: 'Ouvre le suivi du pipeline /ship (étapes, coût, échanges avec les agents)' })
    const ran = await next(e)
    const found = await refresh($).catch(() => null)
    seen = found?.slug
    if (found) openPane($)
    $.clock.every(4000, async () => {
      const now = await refresh($).catch(() => null)
      if (now?.status === 'running' && now.slug !== seen) openPane($)
      seen = now?.slug
    })
    return ran
  })

  // Typing /ship, or the model loading the ship skill, opens the pane before the task folder exists.
  on('prompt.submit', async ($, e, next) => {
    if (/^\s*\/ship(\s|$)/.test(e.text)) openPane($)
    return next(e)
  })

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    if (e.skill === 'ship' || e.skill.endsWith(':ship')) openPane($)
    return next(e)
  })

  on('command.run', { command: 'ship-monitor' }, async $ => {
    await refresh($).catch(() => null)
    await $.ui.open({ id: PANE, title: '/ship' })
    return { text: 'Suivi /ship ouvert.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.agentId) {
      const msg: AgentMsg = {
        agentId: started.agentId,
        type: e.subagentType || 'general-purpose',
        description: e.description,
        prompt: e.prompt,
        startedAt: await $.clock.now(),
      }
      await update($, agents, list => [...list, msg].slice(-40))
    }
    return started
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      const id = e.agentId
      await update($, agents, list =>
        list.map(m =>
          m.agentId === id
            ? {
                ...m,
                answer: e.answer,
                verdict: verdictOf(e.answer ?? ''),
                tokensIn: e.usage ? e.usage.input_tokens + e.usage.cache_read_input_tokens + e.usage.cache_creation_input_tokens : undefined,
                tokensOut: e.usage?.output_tokens,
                durationMs: e.durationMs,
              }
            : m,
        ),
      )
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const t = await read($, task)
    const u = await read($, usage)
    const list = await read($, agents)
    const open = await read($, expanded)
    const rows = e.viewport?.rows ?? 40
    const W = Math.max(34, Math.min(72, e.props.bodyColumns ?? 48))
    const cur = t ? currentPhase(t) : null

    // Palette: one hue per state, one per band, one per agent (parse.ts).
    const C = { done: '#22c55e', cur: '#f59e0b', blocked: '#ef4444', skip: '#64748b', todo: '#475569', text: '#e2e8f0', muted: '#94a3b8' }
    const BANDS = [
      { name: 'CADRER', color: '#38bdf8', ids: ['0', '1', '2', '3', '4'] },
      { name: 'PROUVER', color: '#a78bfa', ids: ['4b', '5', '6'] },
      { name: 'CONSTRUIRE', color: '#fbbf24', ids: ['7', '8'] },
      { name: 'LIVRER', color: '#34d399', ids: ['9', '10', '11', '12'] },
    ]
    const stateOf = (id: string) =>
      t?.done.includes(id) ? 'done' : t?.skipped.includes(id) ? 'skip' : id === cur ? (t?.status === 'blocked' ? 'blocked' : 'cur') : 'todo'
    const lastOf = (type: string) => [...list].reverse().find(m => m.type === type)
    const rule = (title: string, color: string) => (
      <Text color={color} bold>{`━━ ${title} ${'━'.repeat(Math.max(2, W - title.length - 4))}`}</Text>
    )
    const bar = (ratio: number, width: number, fill: string) => {
      const n = Math.round(Math.max(0, Math.min(1, ratio)) * width)
      return (
        <Text>
          <Text color={fill}>{'█'.repeat(n)}</Text>
          <Text color={C.todo}>{'░'.repeat(width - n)}</Text>
        </Text>
      )
    }

    // ── header card ──
    const passed = t ? t.done.length + t.skipped.length : 0
    const status = t?.status ?? 'running'
    const frame = status === 'done' ? C.done : status === 'blocked' ? C.blocked : C.cur
    const curPhase = PHASES.find(p => p.id === cur)
    const header = t ? (
      <Box flexDirection="column" borderStyle="round" borderColor={frame} paddingX={1}>
        <Text bold color={C.text}>{clip(t.slug, W - 6)}</Text>
        <Text>
          <Text backgroundColor="#334155" color={C.text}>{` ${t.size} `}</Text>
          {t.risks.split(',').filter(Boolean).map(r => (
            <Text key={r}>{' '}<Text backgroundColor="#7f1d1d" color="#fecaca">{` ${r.trim()} `}</Text></Text>
          ))}
        </Text>
        <Text>
          {bar(passed / PHASES.length, Math.max(10, W - 14), frame)}
          <Text color={frame} bold>{` ${Math.round((passed / PHASES.length) * 100)}%`}</Text>
        </Text>
        <Text color={frame} bold>
          {status === 'done' ? `✔ PR ouverte ${t.note}` : status === 'blocked' ? `✖ Bloqué : ${t.note}` : `▶ ${curPhase?.id ?? ''} ${curPhase?.label ?? ''}`}
        </Text>
      </Box>
    ) : (
      <Box borderStyle="round" borderColor={C.todo} paddingX={1}>
        <Text color={C.muted}>Aucune tâche /ship dans ce repo. Lance /ship pour en démarrer une.</Text>
      </Box>
    )

    // ── the graph: one bordered node per phase, arrows down the pipeline, agents as nodes on the right ──
    const NODE_W = Math.max(18, Math.min(26, Math.floor(W * 0.45)))
    const AGENT_W = Math.max(12, W - NODE_W - 4)
    const look = (s: string) =>
      s === 'done'
        ? { color: C.done, glyph: '✔', border: 'round' }
        : s === 'cur'
          ? { color: C.cur, glyph: '◉', border: 'bold' }
          : s === 'blocked'
            ? { color: C.blocked, glyph: '✖', border: 'double' }
            : s === 'skip'
              ? { color: C.skip, glyph: '⊘', border: 'single' }
              : { color: C.todo, glyph: '○', border: 'round' }
    const down = (key: string, color: string) => (
      <Text key={key} color={color}>{`${' '.repeat(Math.floor(NODE_W / 2) - 1)}▼`}</Text>
    )

    // The fan-out from a phase to its n agent nodes, one line per agent-box row (3 rows each).
    const fan = (colors: string[], head: string) => (
      <Box flexDirection="column">
        {colors.flatMap((color, i) => {
          const n = colors.length
          const last = i === n - 1
          const lines =
            i === 0
              ? ['    ', n > 1 ? `──┬${head}` : `───${head}`, n > 1 ? '  │ ' : '    ']
              : ['  │ ', last ? `  └${head}` : `  ├${head}`, last ? '    ' : '  │ ']
          return lines.map((l, j) => <Text key={`${i}-${j}`} color={color}>{l}</Text>)
        })}
      </Box>
    )

    const node = (id: string) => {
      const p = PHASES.find(x => x.id === id)
      if (!p) return null
      const s = stateOf(id)
      const { color, glyph, border } = look(s)
      const live = s === 'cur' || s === 'blocked'
      const branches = (p.agents ?? []).map(type => {
        const m = lastOf(type)
        return {
          key: type,
          color: agentColor(type),
          name: type.replace(/^ship-/, ''),
          status: m == null ? 'en attente' : m.answer == null ? '⋯ en cours' : `${m.verdict ?? 'répondu'}`,
          statusColor: m == null ? C.todo : m.answer == null ? C.cur : (verdictColor(m.verdict) ?? C.muted),
        }
      })
      if (p.link === 'oracle')
        branches.push({ key: 'oracle', color: live ? C.cur : C.skip, name: '⟲ tests', status: 'jusqu’au vert', statusColor: live ? C.cur : C.muted })
      return (
        <Box key={id} flexDirection="row">
          <Box borderStyle={border} borderColor={color} width={NODE_W} paddingX={1}>
            <Text wrap="truncate-end">
              {/* the live label carries its own leading space inside its fill */}
              <Text color={color} bold>{live ? glyph : `${glyph} `}</Text>
              {live ? (
                <Text backgroundColor={color} color="#0b0f14" bold>{` ${id} ${p.label} `}</Text>
              ) : (
                <Text color={s === 'todo' ? C.muted : C.text} strikethrough={s === 'skip'}>{`${id} ${p.label}`}</Text>
              )}
            </Text>
          </Box>
          {branches.length > 0 && fan(branches.map(b => b.color), p.link === 'loop' ? '⇄' : '▶')}
          {branches.length > 0 && (
            <Box flexDirection="column">
              {branches.map(b => (
                <Box key={b.key} borderStyle="round" borderColor={b.color} width={AGENT_W} paddingX={1}>
                  <Text wrap="truncate-end">
                    <Text color={b.color} bold>{b.name}</Text>
                    <Text color={b.statusColor} bold>{` ${b.status}`}</Text>
                  </Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )
    }

    // A band whose phases are all passed folds into one node, so the live part of the graph stays on screen.
    const items: { key: string; el: RenderChildren; passed: boolean }[] = []
    for (const b of BANDS) {
      const passedIds = b.ids.filter(id => stateOf(id) === 'done' || stateOf(id) === 'skip')
      if (passedIds.length === b.ids.length) {
        items.push({
          key: b.name,
          passed: true,
          el: (
            <Box key={b.name} borderStyle="round" borderColor={b.color} width={NODE_W} paddingX={1}>
              <Text wrap="truncate-end">
                <Text color={C.done} bold>{'✔ '}</Text>
                <Text color={b.color} bold>{b.name}</Text>
                <Text color={C.muted}>{` ${b.ids.length}/${b.ids.length}`}</Text>
              </Text>
            </Box>
          ),
        })
        continue
      }
      items.push({ key: `h-${b.name}`, passed: false, el: <Text key={`h-${b.name}`} color={b.color} bold>{`▍${b.name}`}</Text> })
      for (const id of b.ids) items.push({ key: id, passed: stateOf(id) === 'done' || stateOf(id) === 'skip', el: node(id) })
    }

    const graph = t && (
      <Box flexDirection="column">
        {items.flatMap((it, i) =>
          it.key.startsWith('h-') || i === items.length - 1 ? [it.el] : [it.el, down(`e-${it.key}`, it.passed ? C.done : C.todo)],
        )}
      </Box>
    )

    // ── usage ──
    const spentIn = list.reduce((s2, m) => s2 + (m.tokensIn ?? 0), 0)
    const spentOut = list.reduce((s2, m) => s2 + (m.tokensOut ?? 0), 0)
    const pct = u?.contextPercent ?? 0
    const gauge = pct < 50 ? C.done : pct < 80 ? C.cur : C.blocked
    const usageBlock = (
      <Box flexDirection="column">
        {rule('USAGE', '#60a5fa')}
        <Text>
          <Text color={C.muted}>{'contexte '}</Text>
          {bar(pct / 100, Math.max(10, W - 22), gauge)}
          <Text color={gauge} bold>{` ${u?.contextPercent != null ? `${pct}%` : '–'}`}</Text>
          <Text color={C.muted}>{` ${kTokens(u?.contextTokens)}`}</Text>
        </Text>
        <Text>
          <Text color={C.muted}>{'session  '}</Text>
          <Text color="#fde68a" bold>{u?.usd != null ? `$${u.usd.toFixed(2)}` : '–'}</Text>
          <Text color={C.muted}>{'   agents '}</Text>
          <Text color={C.text} bold>{`${list.length}`}</Text>
          <Text color={C.muted}>{`  ↑${kTokens(spentIn)} ↓${kTokens(spentOut)}`}</Text>
        </Text>
      </Box>
    )

    // ── messages ──
    const room = Math.max(2, Math.floor((rows - 40) / 3))
    const shown = list.slice(-room)
    const messages = (
      <Box flexDirection="column">
        {rule('ÉCHANGES', '#f472b6')}
        {shown.length === 0 && <Text color={C.muted}>Aucun agent lancé dans cette session.</Text>}
        {shown.map(m => {
          const ac = agentColor(m.type)
          return (
            <Box key={m.agentId} flexDirection="column">
              <Text>
                <Text color={ac}>{'▌ '}</Text>
                <Text backgroundColor={ac} color="#0b0f14" bold>{` ${m.type.replace(/^ship-/, '')} `}</Text>
                <Text color={C.text}>{` ${clip(m.description, W - m.type.length - 6)}`}</Text>
              </Text>
              <Box flexDirection="row" gap={1}>
                <Text>
                  <Text color={ac}>{'▌ '}</Text>
                  {m.answer == null ? (
                    <Text color={C.cur} bold>⋯ en cours</Text>
                  ) : (
                    <Text>
                      <Text color={verdictColor(m.verdict) ?? C.muted} bold>{`↳ ${m.verdict ?? 'répondu'}`}</Text>
                      <Text color={C.muted}>{` · ${kTokens((m.tokensIn ?? 0) + (m.tokensOut ?? 0))} tok · ${Math.round((m.durationMs ?? 0) / 1000)}s`}</Text>
                    </Text>
                  )}
                </Text>
                <Button key={`x-${m.agentId}`} label={open === m.agentId ? 'replier' : 'détail'} onPress={() => update($, expanded, v => (v === m.agentId ? null : m.agentId))} />
                <Button key={`v-${m.agentId}`} label="transcript" onPress={() => void $.ui.view({ agentId: m.agentId })} />
              </Box>
              {open === m.agentId && (
                <Box flexDirection="column" borderStyle="single" borderColor={ac} paddingX={1}>
                  <Text color={ac} bold>prompt</Text>
                  {firstLines(m.prompt, 8).map((l, i) => <Text key={`p${i}`} color={C.muted} wrap="truncate-end">{l}</Text>)}
                  {m.answer != null && <Text color={verdictColor(m.verdict) ?? ac} bold>réponse</Text>}
                  {m.answer != null && firstLines(m.answer, 10).map((l, i) => <Text key={`a${i}`} color={C.text} wrap="truncate-end">{l}</Text>)}
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {graph}
        {usageBlock}
        {messages}
      </Box>
    )
  })
}
