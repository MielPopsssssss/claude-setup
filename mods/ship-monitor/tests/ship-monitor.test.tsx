import { expect, test } from 'claude-code/testing'

import { currentPhase, parseState, verdictOf } from '../hooks/parse'

const STATE = `# export-findings-csv
taille: M
risques: UI visible, données/permissions
- [x] 0 profils — 2026-11-06
- [x] 1 tri — M
- [x] 2 inventaire — 3 candidats
- [x] 3 plan — PASS (2e passe)
- [x] 4 plan validé — 2026-11-06
- [x] 4b autopilote
- [x] 5 branche feature/export-csv
- [-] 6 tests — sauté
`

test('state.md gives the done, skipped and current phases', async () => {
  const t = parseState(STATE, 'folder', 1)
  expect(t.slug).toBe('export-findings-csv')
  expect(t.size).toBe('M')
  expect(t.done).toEqual(['0', '1', '2', '3', '4', '4b', '5'])
  expect(t.skipped).toEqual(['6'])
  expect(currentPhase(t)).toBe('7')
  expect(currentPhase(parseState(`${STATE}BLOCKED — test figé faux`, 'f', 1))).toBe(null)
  expect(parseState(`${STATE}DONE — https://x/pr/1`, 'f', 1).status).toBe('done')
  expect(verdictOf('blah\nVERDICT: REVISE\n')).toBe('REVISE')
})

const PANE = {
  plugin: 'ship-monitor',
  component: 'Pane',
  requestId: 'ship-monitor',
  props: { title: '/ship', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const

test('the pane shows the task found under .ship, on every surface', async ($, on) => {
  on('command.register', () => ({ value: { command: 'ship-monitor' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo/wt' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/repo/.git\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('fs.list', () => ({ value: [{ name: 'export-findings-csv', kind: 'dir', size: 0, mtimeMs: 5 }] }))
  on('fs.stat', () => ({ value: { mtimeMs: 5, size: 10, kind: 'file' } }))
  on('fs.read', () => ({ value: STATE }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 42000, window: 200000, percent: 21 }, rateLimits: [], cost: { usd: 1.5 } } }))
  on('clock.every', () => ({ value: { cancel: () => undefined } }))

  await $.session.start({ cwd: '/repo/wt', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /UI visible/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /7 Code/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /\$1\.50/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /21%/ })).toBeTruthy()
    // CADRER is fully passed, so it folds into one node.
    expect(await ui.find({ type: 'Text', text: /CADRER 5\/5/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /security en attente/ })).toBeTruthy()
    await ui.unmount()
  }
})

test('typing /ship opens the pane, other prompts do not', async ($, on) => {
  const opened: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: {} }))

  await $.prompt.submit({ text: 'fix the typo' })
  await $.prompt.submit({ text: '/shipit' })
  expect(opened).toEqual([])
  await $.prompt.submit({ text: '/ship prends l’issue 12' })
  expect(opened).toEqual(['ship-monitor'])
  await $.tool.call({ tool: 'Skill', skill: 'ship' })
  expect(opened).toEqual(['ship-monitor', 'ship-monitor'])
})
