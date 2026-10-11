import { expect, mock, test } from 'claude-code/testing'
import { textWidth } from '../hooks/crab'
import { isNewer } from '../hooks/files'
import { applyTask, holderOf, reportOf, tasksReport, todoReport } from '../hooks/progress'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

const SURFACES = ['terminal', 'desktop'] as const
const PANE_PROPS = { title: 'Crew', isFocused: false, bodyColumns: 60, placement: 'dock' } as never

// Stands in for the engine beneath the mod: spawns answer with an id per call,
// the list holds what each test puts there, git is not a repository, UI calls
// are recorded, every tool call succeeds.
// `run` answers the commands the mod runs (git), else "not a git repository".
type RunAnswer = { exitCode: number; stdout: string; stderr?: string }
// A pane as the host keeps it: open, the one shown or a tab behind, placed or waiting.
type PaneState = { id: string; isShown: boolean; isPlaced: boolean }

// `panes`: the panes open at the start. They change as the host's would: opening
// a new id shows and places it, opening an open id only retitles it (it stays
// where it was, behind or unplaced), closing removes it.
function engine(on: On, listed: AgentInfo[] = [], run?: (argv: string[]) => RunAnswer | undefined, panes: PaneState[] = []) {
  const clock = mock.clock(on)
  mock.env(on, { LANG: 'de_DE.UTF-8' })
  const opened: string[] = []
  const status: (string | undefined)[] = []
  const toasts: string[] = []
  on('ui.toast', (_$, e) => (toasts.push(e.text), { value: undefined }))
  let n = 0
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { percent: 31, tokens: 62000, window: 200000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 6 }, { kind: 'seven_day', percentUsed: 7 }] } }) as never)
  const runs: string[][] = []
  on('process.run', (_$, e) => {
    const argv = [...(e as { argv: string[] }).argv]
    runs.push(argv)
    const r = run?.(argv) ?? { exitCode: 128, stdout: '', stderr: 'not a git repository' }
    return { value: { stderr: '', isStdoutTruncated: false, ...r } } as never
  })
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: `a${++n}` }))
  on('agent.list', () => ({ value: listed }))
  on('ui.open', (_$, e) => {
    opened.push(e.id)
    const pane = panes.find(p => p.id === e.id)
    if (!pane) panes.push({ id: e.id, isShown: true, isPlaced: true })
    return { value: { isPlaced: pane ? pane.isPlaced : true } } as never
  })
  on('ui.close', (_$, e) => {
    const i = panes.findIndex(p => p.id === e.id)
    if (i >= 0) panes.splice(i, 1)
    return { value: undefined } as never
  })
  on('ui.panes', () => ({ value: panes.map(p => ({ ...p, title: p.id, isFocused: false })) }) as never)
  on('ui.status', (_$, e) => (status.push(e.text), { value: undefined }))
  on('settings.read', () => ({ value: {} }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('turn.complete', (_$, e) => ({ text: '', usage: e.usage }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  const configSets: { key: string; value: unknown }[] = []
  on('config.list', () => ({ value: [] }))
  on('config.set', (_$, e) => (configSets.push({ key: e.key, value: e.value }), { value: e.value }))
  on('tool.call', () => ({ result: 'ok' }) as never)
  return { opened, status, toasts, clock, configSets, runs, panes }
}

const start = ($: Engine) => $.session.start({ cwd: '/work', surface: null, isInteractive: true })

const spawn = ($: Engine, description: string, subagentType: string) =>
  $.agent.spawn({ prompt: 'Lies die README.', description, subagentType } as never)

const mount = ($: Engine, surface: (typeof SURFACES)[number]) =>
  $.ui.mount({ plugin: 'agent-crew', surface, component: 'Pane', requestId: 'agent-crew', props: PANE_PROPS })

type Mounted = Awaited<ReturnType<typeof mount>>

// The file tree draws its rows in Clients (`rows-a` above the open file, `rows-o`
// the open one, `rows-b` below): a row is clicked where it sits.
const clickRow = (ui: Mounted, client: string, y: number) => ui.pointer({ type: 'down', x: 4, y, button: 'left', in: client })
const expandAll = async (ui: Mounted) => {
  if (JSON.stringify(await ui.drawn()).includes('"key":"files-fold-all","label":"⊞"')) await ui.press({ key: 'files-fold-all' })
}
const hasRow = async (ui: Mounted, id: string) => JSON.stringify(await ui.drawn()).includes(`"id":"${id}"`)

// An agent's row and the tabs: Buttons in the terminal; on the desktop, click
// regions (hotspot.tsx) that take the press itself.
type Surface = (typeof SURFACES)[number]
const hasRun = async (ui: Mounted, id: string) => {
  const drawn = JSON.stringify(await ui.drawn())
  return drawn.includes(`"key":"d-${id}"`) || drawn.includes(`"key":"rowhit-${id}"`)
}
const openRun = (ui: Mounted, surface: Surface, id: string) =>
  surface === 'desktop' ? ui.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: `rowhit-${id}` }) : ui.press({ key: `d-${id}` })
const showTab = (ui: Mounted, surface: Surface, tab: 'active' | 'done') =>
  surface === 'desktop'
    ? ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: `tabhit-${tab}` })
    : ui.pointer({ type: 'down', x: tab === 'done' ? 16 : 2, y: 1, button: 'left', in: 'tabs' })

test('records every spawn, not only savvy ones, and splits them into tabs', async ($, on) => {
  const { opened, status } = engine(on)
  await start($)
  await spawn($, 'Codebase durchsuchen', 'Explore')
  await spawn($, 'Plan entwerfen', 'Plan')

  expect(opened).toEqual(['agent-crew'])
  expect(status.at(-1)).toBe('🦀 2 Subagenten aktiv')

  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'Fertig.', turnId: 't1' } as never)
  expect(status.at(-1)).toBe('🦀 1 Subagent aktiv')

  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    const tabs = surface === 'desktop' ? 'tabhit-done' : 'tabs'
    expect(await ui.find({ key: tabs })).toBeDefined()
    expect(await hasRun(ui, 'a2')).toBe(true)
    expect(await hasRun(ui, 'a1')).toBe(false)
    // Clearing the finished ones belongs to their tab.
    expect(await ui.find({ key: 'clear' })).toBeUndefined()
    await showTab(ui, surface, 'done')
    expect(await hasRun(ui, 'a1')).toBe(true)
    expect(await ui.find({ key: 'clear' })).toBeDefined()
    await showTab(ui, surface, 'active')
  }
})

test('details show what a subagent did last, and the files it touched', async ($, on) => {
  engine(on)
  await start($)
  await spawn($, 'README lesen', 'general-purpose')
  await $.tool.call({ tool: 'Read', file_path: '/work/README.md', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/app.ts', old_string: 'a', new_string: 'b' } as never)

  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    await openRun(ui, surface, 'a1')
    expect(await ui.find({ text: /Read/ })).toBeDefined()
    expect(await ui.find({ text: /README\.md/ })).toBeDefined()
    expect(await ui.find({ key: 'files-toggle' })).toBeDefined()
    await openRun(ui, surface, 'a1')
  }
})

test('picks up agents only the engine list knows', async ($, on) => {
  const { status } = engine(on, [{ id: 'x9', type: 'general-purpose', description: 'Fork aus Skill', status: 'running' }])
  await start($)
  expect(status.at(-1)).toBe('🦀 1 Subagent aktiv')
})

test('session totals stay hidden unless the option turns them on', async ($, on) => {
  engine(on)
  await start($)
  await spawn($, 'Etwas tun', 'general-purpose')
  const ui = await mount($, 'terminal')
  expect(await ui.find({ text: /Subagenten \(\d+\)/ })).toBeUndefined()
})

test('the showTotals option draws them', { options: { showTotals: true } }, async ($, on) => {
  engine(on)
  await start($)
  await spawn($, 'Etwas tun', 'general-purpose')
  const ui = await mount($, 'terminal')
  expect(await ui.find({ text: /Subagenten \(\d+\)/ })).toBeDefined()
})

test('a framed usage section shows context, 5h and week', async ($, on) => {
  engine(on)
  await start($)
  const ui = await mount($, 'terminal')
  expect(await ui.find({ text: /Kontext/ })).toBeDefined()
  expect(await ui.find({ text: /5 Std\./ })).toBeDefined()
  expect(await ui.find({ text: /Woche/ })).toBeDefined()
  expect(await ui.find({ key: 'run-compact' })).toBeDefined()
})

test('showUsage off hides the usage section', { options: { showUsage: false } }, async ($, on) => {
  engine(on)
  await start($)
  const ui = await mount($, 'terminal')
  expect(await ui.find({ text: /Kontext/ })).toBeUndefined()
})

// A turn of the main chat, `ms` long: the main loop alone raises turn.start.
async function mainTurn($: Engine, clock: { advance: (ms: number) => Promise<unknown> }, id: string, ms: number, reason = 'answer') {
  await $.turn.start({ text: 'Mach weiter', turnId: id } as never)
  await clock.advance(ms)
  await $.turn.complete({ reason, answer: 'Erledigt.', turnId: id } as never)
}

// The timeline section of what a surface draws now.
const timelineOf = async ($: Engine, surface: Surface) => {
  const ui = await mount($, surface)
  let out = ''
  JSON.stringify(await ui.drawn(), (_k, v) => {
    if (v && typeof v === 'object' && v.props?.key === 'sec-timeline') out = JSON.stringify(v)
    return v
  })
  await ui.unmount()
  return out
}

test("the timeline shows the main chat's turns in a row of their own, above the subagents", async ($, on) => {
  const { clock } = engine(on)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  await start($)
  await mainTurn($, clock, 't1', 30_000)
  await clock.advance(5_000)
  // Without a subagent the timeline is there already, for the main chat alone.
  for (const surface of SURFACES) {
    const tl = await timelineOf($, surface)
    expect(tl).toContain('Hauptchat')
    expect(tl).toContain('#D97757')
  }
  await $.turn.start({ text: 'Und die Tests', turnId: 't2' } as never)
  await spawn($, 'Tests schreiben', 'general-purpose')
  await clock.advance(20_000)
  for (const surface of SURFACES) {
    const tl = await timelineOf($, surface)
    // The main chat first, then the agent.
    expect(tl.indexOf('Hauptchat')).toBeGreaterThanOrEqual(0)
    expect(tl.indexOf('Hauptchat')).toBeLessThan(tl.indexOf('Tests schreiben'))
  }
  // Two turns, the second still open: two bars in the row, on the desktop.
  const desk = await timelineOf($, 'desktop')
  expect(desk.match(/fill=\\"#D97757\\" opacity=\\"0.9\\"/g)?.length).toBe(2)
})

test('the main chat leaves the timeline with timelineMain off', { options: { timelineMain: false } }, async ($, on) => {
  const { clock } = engine(on)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  await start($)
  await mainTurn($, clock, 't1', 30_000)
  for (const surface of SURFACES) expect(await timelineOf($, surface)).toBe('')
  await spawn($, 'Tests schreiben', 'general-purpose')
  for (const surface of SURFACES) {
    const tl = await timelineOf($, surface)
    expect(tl).toContain('Tests schreiben')
    expect(tl).not.toContain('Hauptchat')
  }
})

test("without its row, the main chat's work still spans the timeline's axis", { options: { timelineMain: false } }, async ($, on) => {
  const { clock } = engine(on)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  await start($)
  // Half an hour of work before the first subagent, which then runs for 20 seconds.
  await $.turn.start({ text: 'Los', turnId: 't1' } as never)
  await clock.advance(30 * 60_000)
  await spawn($, 'Tests schreiben', 'general-purpose')
  await clock.advance(20_000)
  const tl = await timelineOf($, 'desktop')
  expect(tl).not.toContain('Hauptchat')
  // The axis runs from when the session began to work, not from the subagent.
  expect(tl).toContain('>30:20<')
})

test('every type its own colour and costume; savvy types wear the cap like any other', async ($, on) => {
  engine(on)
  await start($)
  await spawn($, 'Allzweck', 'general-purpose')
  await spawn($, 'Suchen', 'Explore')
  await spawn($, 'Alpha', 'my-plugin:alpha')
  await spawn($, 'Beta', 'beta')
  await spawn($, 'Savvy', 'savvy-flow:savvy-heavy')
  const ui = await mount($, 'desktop')
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('c-detective')
  expect(drawn).toContain('c-pirate')
  expect(drawn).toContain('c-cap')
  expect(drawn).not.toContain('c-heavy')
  // Built-in types keep theirs; the others take the free colours in the order they came.
  for (const c of ['#378ADD', '#1D9E75', '#D85A30', '#C2477E', '#6F8F2E']) expect(drawn).toContain(c)
  // A later agent of a known type, from another plugin even, wears the same colour: no new one is handed out.
  await spawn($, 'Alpha zwei', 'other-plugin:Alpha')
  await ui.unmount()
  const again = JSON.stringify(await (await mount($, 'desktop')).drawn())
  expect(again).not.toContain('#9C6644')
})

const spawnBg = ($: Engine, description: string) =>
  $.agent.spawn({ prompt: 'p', description, subagentType: 'general-purpose', background: true } as never)

test('two agents changing one file raise a conflict, in a notice and in the tree', async ($, on) => {
  const { toasts, clock } = engine(on)
  await start($)
  await spawn($, 'Erster', 'general-purpose')
  await spawn($, 'Zweiter', 'general-purpose')
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/app.ts', old_string: 'a', new_string: 'b', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/app.ts', old_string: 'b', new_string: 'c', agentId: 'a2' } as never)
  expect(toasts.some(t => t.includes('app.ts') && t.includes('Erster') && t.includes('Zweiter'))).toBe(true)

  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    await expandAll(ui)
    expect(JSON.stringify(await ui.drawn())).toContain('⚠')
    await clickRow(ui, 'rows-a', 1)
    expect(await ui.find({ text: /Von mehreren Agenten geändert/ })).toBeDefined()
    expect(await ui.find({ key: 'open-/work/src/app.ts' })).toBeDefined()
    await clock.advance(1000)
    await clickRow(ui, 'rows-o', 0)
    await clock.advance(1000)
  }
})

test('the conflict notice can be turned off', { options: { warnConflicts: false } }, async ($, on) => {
  const { toasts } = engine(on)
  await start($)
  await spawn($, 'Erster', 'general-purpose')
  await spawn($, 'Zweiter', 'general-purpose')
  await $.tool.call({ tool: 'Edit', file_path: '/work/a.ts', old_string: 'a', new_string: 'b', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/work/a.ts', old_string: 'b', new_string: 'c', agentId: 'a2' } as never)
  expect(toasts.some(t => t.includes('a.ts'))).toBe(false)
})

test('a background agent that finishes says so; a foreground one stays quiet', async ($, on) => {
  const { toasts } = engine(on)
  await start($)
  await spawnBg($, 'Hintergrund')
  await spawn($, 'Vordergrund', 'general-purpose')
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'ok', turnId: 't1' } as never)
  await $.turn.complete({ agentId: 'a2', reason: 'answer', answer: 'ok', turnId: 't2' } as never)
  expect(toasts.some(t => t.includes('Hintergrund ist fertig'))).toBe(true)
  expect(toasts.some(t => t.includes('Vordergrund'))).toBe(false)
})

test('notifyAgents off keeps finished agents quiet', { options: { notifyAgents: 'off' } }, async ($, on) => {
  const { toasts } = engine(on)
  await start($)
  await spawnBg($, 'Hintergrund')
  await $.turn.complete({ agentId: 'a1', reason: 'error', answer: '', turnId: 't1' } as never)
  expect(toasts.length).toBe(0)
})

test('limits warn once when they pass 80 %, and the context at 85 %', async ($, on) => {
  const { toasts } = engine(on)
  await start($)
  const measure = { context: { percent: 90, tokens: 180000, window: 200000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 82 }], changed: ['context', 'rateLimits'] }
  await $.session.measure(measure as never)
  await $.session.measure(measure as never)
  expect(toasts.filter(t => t.includes('5 Std.-Limit bei 82 %')).length).toBe(1)
  expect(toasts.filter(t => t.includes('Kontext zu 90 %')).length).toBe(1)
})

test('the timeline shows under the agents, and the option hides it', async ($, on) => {
  engine(on)
  await start($)
  await spawn($, 'Etwas tun', 'general-purpose')
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect(await ui.find({ key: 'timeline-toggle' })).toBeDefined()
  }
})

test('compact folds the agents alone; usage and files stay', async ($, on) => {
  engine(on)
  await start($)
  await spawn($, 'Etwas tun', 'general-purpose')
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    await ui.press({ key: 'compact' })
    expect(await hasRun(ui, 'a1')).toBe(false)
    expect(await ui.find({ key: 'files-toggle' })).toBeDefined()
    expect(await ui.find({ key: 'run-compact' })).toBeDefined()
    await ui.press({ key: 'compact' })
    expect(await hasRun(ui, 'a1')).toBe(true)
  }
})

test('compact labels and separates active and finished agents', async ($, on) => {
  engine(on)
  await start($)
  await spawn($, 'Läuft noch', 'general-purpose')
  await spawn($, 'Schon fertig', 'Explore')
  await $.turn.complete({ agentId: 'a2', reason: 'answer', answer: 'ok', turnId: 't2' } as never)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    await ui.press({ key: 'compact' })
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('Aktiv')
    expect(drawn).toContain('Fertig')
    await ui.press({ key: 'compact' })
  }
})

test('a long pause between rounds folds into a break on the timeline', async ($, on) => {
  const { clock } = engine(on)
  await start($)
  await spawn($, 'Erste Runde', 'general-purpose')
  await clock.advance(5_000)
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'ok', turnId: 't1' } as never)
  await clock.advance(20 * 60_000)
  await spawn($, 'Zweite Runde', 'general-purpose')
  await clock.advance(5_000)
  await $.turn.complete({ agentId: 'a2', reason: 'answer', answer: 'ok', turnId: 't2' } as never)
  const ui = await mount($, 'desktop')
  expect(JSON.stringify(await ui.drawn())).toMatch(/\+20:0\d/)
})

const SETTINGS_PROPS = { title: 'Crew · Einstellungen', isFocused: false, bodyColumns: 60, placement: 'dock' } as never

test('/crew-settings opens the settings pane', async ($, on) => {
  const { opened } = engine(on)
  await start($)
  const r = await $.command.run({ command: 'crew-settings', args: '' } as never)
  expect(opened).toContain('agent-crew-settings')
  expect(JSON.stringify(r)).toContain('Crew-Einstellungen')
})

test('settings write through /config and take effect at once', async ($, on) => {
  const { configSets } = engine(on)
  await start($)
  await spawn($, 'Etwas tun', 'general-purpose')
  for (const surface of SURFACES) {
    const settings = await $.ui.mount({ plugin: 'agent-crew', surface, component: 'Pane', requestId: 'agent-crew-settings', props: SETTINGS_PROPS })
    expect(JSON.stringify(await settings.drawn())).toContain('Benachrichtigungen')
    await settings.press({ key: 'set-notifyAgents-all' })
    expect(configSets.at(-1)).toEqual({ key: 'agent-crew.notifyAgents', value: 'all' })
    await settings.unmount()
  }
  const settings = await $.ui.mount({ plugin: 'agent-crew', surface: 'terminal', component: 'Pane', requestId: 'agent-crew-settings', props: SETTINGS_PROPS })
  await settings.press({ key: 'set-showTotals' })
  expect(configSets.at(-1)).toEqual({ key: 'agent-crew.showTotals', value: true })
  const crew = await mount($, 'terminal')
  expect(await crew.find({ text: /Subagenten \(\d+\)/ })).toBeDefined()
  expect(await crew.find({ key: 'open-settings' })).toBeDefined()
})

test('the search line narrows the file tree, and Enter opens the first hit', async ($, on) => {
  const { clock } = engine(on)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/utils.ts' } as never)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    await expandAll(ui)
    expect(await hasRow(ui, '/work/src/app.ts')).toBe(true)
    // A click gives the field the keys; it spans the frame and has no button.
    await ui.resize({ columns: 40, rows: 3, in: 'search' })
    await ui.pointer({ type: 'down', x: 5, y: 1, button: 'left', in: 'search' })
    for (const key of ['u', 't', 'i', 'l']) await ui.key({ key, in: 'search' })
    expect(await hasRow(ui, '/work/src/app.ts')).toBe(false)
    expect(await hasRow(ui, '/work/src/utils.ts')).toBe(true)
    expect(JSON.stringify(await ui.drawn())).toContain('1 Treffer')
    await ui.key({ key: 'return', in: 'search' })
    expect(await ui.find({ key: 'open-/work/src/utils.ts' })).toBeDefined()
    // The × at the field's right end clears it.
    await ui.pointer({ type: 'down', x: 38, y: 1, button: 'left', in: 'search' })
    expect(await hasRow(ui, '/work/src/app.ts')).toBe(true)
    await clickRow(ui, 'rows-o', 0)
    await clock.advance(1000)
  }
})

test('a freshly touched file shimmers on the desktop', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/app.ts', old_string: 'a', new_string: 'b' } as never)
  const ui = await mount($, 'desktop')
  await expandAll(ui)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('filerows.tsx')
  expect(drawn).toContain('"sh":"write"')
})

test('cleared agents stay gone when the engine list still holds them', async ($, on) => {
  engine(on, [{ id: 'x9', type: 'general-purpose', description: 'Fork aus Skill', status: 'completed' }])
  await start($)
  let ui = await mount($, 'desktop')
  await showTab(ui, 'desktop', 'done')
  expect(await hasRun(ui, 'x9')).toBe(true)
  await ui.press({ key: 'clear' })
  await ui.unmount()
  await $.command.run({ command: 'crew', args: '' } as never)
  ui = await mount($, 'desktop')
  expect(await ui.find({ key: 'clear' })).toBeUndefined()
})

test('grep -n and sed -n count the file they read', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: "grep -n 'foo' src/app.ts" } as never)
  await $.tool.call({ tool: 'Bash', command: "sed -n '1,40p' src/utils.ts" } as never)
  await $.tool.call({ tool: 'Bash', command: 'head -n 20 README.md' } as never)
  const ui = await mount($, 'terminal')
  await expandAll(ui)
  expect(await hasRow(ui, '/work/src/app.ts')).toBe(true)
  expect(await hasRow(ui, '/work/src/utils.ts')).toBe(true)
  expect(await hasRow(ui, '/work/README.md')).toBe(true)
})

test('subagents and files can each be hidden', { options: { showAgents: false, showFiles: false } }, async ($, on) => {
  engine(on)
  await start($)
  await spawn($, 'Etwas tun', 'general-purpose')
  await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' } as never)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect(await hasRun(ui, 'a1')).toBe(false)
    expect(await hasRow(ui, '/work/src/app.ts')).toBe(false)
    expect(JSON.stringify(await ui.drawn())).toContain('Kontext')
  }
})

test('the usage section shows only the meters the options keep', { options: { usageContext: false, usageWeek: false } }, async ($, on) => {
  engine(on)
  await start($)
  const ui = await mount($, 'terminal')
  expect(await ui.find({ text: /Kontext/ })).toBeUndefined()
  expect(await ui.find({ text: /5 Std\./ })).toBeDefined()
  expect(await ui.find({ text: /Woche/ })).toBeUndefined()
})

test('the settings pane groups sections and usage meters', async ($, on) => {
  const { configSets } = engine(on)
  await start($)
  const settings = await $.ui.mount({ plugin: 'agent-crew', surface: 'terminal', component: 'Pane', requestId: 'agent-crew-settings', props: SETTINGS_PROPS })
  const drawn = JSON.stringify(await settings.drawn())
  expect(drawn).toContain('Abschnitte')
  expect(drawn).toContain('Wochenlimit')
  await settings.press({ key: 'set-showFiles' })
  expect(configSets.at(-1)).toEqual({ key: 'agent-crew.showFiles', value: false })
  const crew = await mount($, 'terminal')
  expect(await crew.find({ key: 'files-toggle' })).toBeUndefined()
})

test("a press opens a file's card, a double press the file itself", async ($, on) => {
  const { runs, clock } = engine(on)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' } as never)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    await expandAll(ui)
    await clickRow(ui, 'rows-a', 1)
    expect(await ui.find({ key: 'open-/work/src/app.ts' })).toBeDefined()
    const before = runs.length
    await clickRow(ui, 'rows-o', 0)
    expect(runs.slice(before).some(argv => argv.join(' ').includes('/work/src/app.ts'))).toBe(true)
    expect(await ui.find({ key: 'open-/work/src/app.ts' })).toBeDefined()
    await clock.advance(1000)
    await clickRow(ui, 'rows-o', 0)
    expect(await ui.find({ key: 'open-/work/src/app.ts' })).toBeUndefined()
    await clock.advance(1000)
  }
})

test('a folder shuts and opens on a press', async ($, on) => {
  const { clock } = engine(on)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/work/README.md' } as never)
  // Past the shimmer, while which a touched file's folders stand open.
  await clock.advance(10_000)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    // Folders start shut.
    expect(await hasRow(ui, '/work/src/app.ts')).toBe(false)
    expect(await hasRow(ui, '/work/README.md')).toBe(true)
    await clickRow(ui, 'rows-a', 0)
    expect(await hasRow(ui, '/work/src/app.ts')).toBe(true)
    await clock.advance(1000)
    await clickRow(ui, 'rows-a', 0)
    expect(await hasRow(ui, '/work/src/app.ts')).toBe(false)
    await clock.advance(1000)
  }
})

test('the search field loses its focus when the prompt or another button takes the keys', async ($, on) => {
  engine(on)
  on('prompt.edit', (_$, e) => ({ text: e.text, cursor: e.cursor }) as never)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' } as never)
  const ui = await mount($, 'terminal')
  const isFocused = async () => JSON.stringify(await ui.drawn()).includes('"isFocused":true')
  expect(await isFocused()).toBe(false)
  await ui.pointer({ type: 'down', x: 5, y: 1, button: 'left', in: 'search' })
  expect(await isFocused()).toBe(true)
  // The engine raises prompt.edit; the test API carries it untyped.
  await ($.prompt as unknown as { edit: (e: unknown) => Promise<unknown> }).edit({ text: 'a', cursor: 1, start: 0, end: 0, inputText: 'a' })
  expect(await isFocused()).toBe(false)
  await ui.key({ key: 'a', in: 'search' })
  expect(await isFocused()).toBe(true)
  await ui.press({ key: 'files-filter-changed' })
  expect(await isFocused()).toBe(false)
})

test('a double press enters a folder, the breadcrumbs lead back, ⊞ opens them all', async ($, on) => {
  const { clock } = engine(on)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/auth/tokens.ts' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/work/README.md' } as never)
  await clock.advance(10_000)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    // src/ is row 0: two presses close together enter it.
    await clickRow(ui, 'rows-a', 0)
    await clickRow(ui, 'rows-a', 0)
    expect(await hasRow(ui, '/work/README.md')).toBe(false)
    expect(await hasRow(ui, '/work/src/app.ts')).toBe(true)
    // The breadcrumbs: a heading under the search line, each step a link.
    const crumbs = JSON.stringify(await ui.drawn())
    expect(crumbs).toContain('#### [⌂ work](file:///work) › **src**')
    // Its folders start shut: ⊞ opens every one in view, ⊟ shuts them again.
    expect(await hasRow(ui, '/work/src/auth/tokens.ts')).toBe(false)
    await ui.press({ key: 'files-fold-all' })
    expect(await hasRow(ui, '/work/src/auth/tokens.ts')).toBe(true)
    await ui.press({ key: 'files-fold-all' })
    expect(await hasRow(ui, '/work/src/auth/tokens.ts')).toBe(false)
    await ui.press({ key: 'files-crumbs', link: { href: 'file:///work' } })
    expect(await hasRow(ui, '/work/README.md')).toBe(true)
    // Back at the top the main folder stays, as the current step.
    expect(JSON.stringify(await ui.drawn())).toContain('#### **⌂ work**')
    await clock.advance(1000)
  }
})

test("an open file's card without changes shows its history alone, no tabs", async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' } as never)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    await expandAll(ui)
    await clickRow(ui, 'rows-a', 1)
    expect(await ui.find({ key: 'ftab-history' })).toBeUndefined()
    expect(await ui.find({ key: 'ftab-changes' })).toBeUndefined()
    expect(await ui.find({ text: /^Verlauf$/ })).toBeUndefined()
    expect(await ui.find({ text: /gelesen/ })).toBeDefined()
    expect(await ui.find({ key: 'open-/work/src/app.ts' })).toBeDefined()
  }
})

test('the tree opens the pane on the first file read, once', async ($, on) => {
  const { opened } = engine(on)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/work/README.md' } as never)
  expect(opened.filter(id => id === 'agent-crew')).toEqual(['agent-crew'])
})

test('autoOpenFiles off keeps the pane shut on file reads', { options: { autoOpenFiles: false } }, async ($, on) => {
  const { opened } = engine(on)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' } as never)
  expect(opened).toEqual([])
})

test('the filters: activity by default, changes alone, or every file under the root', async ($, on) => {
  const { clock } = engine(on)
  const entry = (name: string, kind: 'file' | 'dir') => ({ name, kind, size: 1, mtimeMs: 0, isLink: false })
  // The host spells the path its own way (C:\work on Windows): compare the tail.
  const listing: Record<string, ReturnType<typeof entry>[]> = { '/work': [entry('src', 'dir'), entry('notes.md', 'file'), entry('node_modules', 'dir')], '/work/src': [entry('app.ts', 'file')] }
  on('fs.list', (_$, e) => ({ value: listing[(e as { path: string }).path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')] ?? [] }) as never)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' } as never)
  const ui = await mount($, 'terminal')
  await expandAll(ui)
  expect(await hasRow(ui, '/work/src/app.ts')).toBe(true)
  expect(await hasRow(ui, '/work/notes.md')).toBe(false)
  await ui.press({ key: 'files-filter-changed' })
  expect(await hasRow(ui, '/work/src/app.ts')).toBe(false)
  await ui.press({ key: 'files-filter-all' })
  await clock.advance(10)
  expect(await hasRow(ui, '/work/notes.md')).toBe(true)
  expect(await hasRow(ui, '/work/node_modules')).toBe(false)
  expect(await hasRow(ui, '/work/src/app.ts')).toBe(true)
  await ui.press({ key: 'files-filter-activity' })
  expect(await hasRow(ui, '/work/notes.md')).toBe(false)
})

test('a newer published version shows beside the settings, once as a notice, and in the settings pane', async ($, on) => {
  const { toasts, clock } = engine(on)
  mock.store(on)
  // This copy's manifest, and the one GitHub publishes.
  on('fs.read', (_$, e) => ({ value: (e as { path: string }).path.endsWith('plugin.json') ? JSON.stringify({ version: '0.6.0', repository: 'https://github.com/jduerrmann/agent-crew' }) : '' }) as never)
  const fetched: string[] = []
  on('http.fetch', (_$, e) => (fetched.push((e as { url: string }).url), { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ version: '9.9.9' }) } }) as never)
  await start($)
  await clock.advance(6_000)
  expect(fetched).toEqual(['https://raw.githubusercontent.com/jduerrmann/agent-crew/HEAD/plugins/agent-crew/.claude-plugin/plugin.json'])
  expect(toasts.filter(t => t.includes('agent-crew 9.9.9 ist verfügbar'))).toHaveLength(1)
  const ui = await mount($, 'terminal')
  expect(await ui.find({ key: 'update-badge' })).toBeDefined()
  const settings = await $.ui.mount({ plugin: 'agent-crew', surface: 'terminal', component: 'Pane', requestId: 'agent-crew-settings', props: SETTINGS_PROPS })
  const drawn = JSON.stringify(await settings.drawn())
  expect(drawn).toContain('9.9.9 verfügbar')
  expect(await settings.find({ key: 'update-check' })).toBeDefined()
})

test('checkUpdates off asks nothing of the network', { options: { checkUpdates: false } }, async ($, on) => {
  const { clock, toasts } = engine(on)
  mock.store(on)
  let asked = 0
  on('http.fetch', () => (asked++, { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ version: '9.9.9' }) } }) as never)
  await start($)
  await clock.advance(6_000)
  expect(asked).toBe(0)
  expect(toasts.some(t => t.includes('9.9.9'))).toBe(false)
})

test('sed -i, find -delete and find -exec count as changes and refresh git; plain readers do not', { options: { autoOpenFiles: false } }, async ($, on) => {
  const { runs, clock } = engine(on)
  await start($)
  await clock.advance(1_000)
  const gitRuns = () => runs.filter(argv => argv[0] === 'git').length
  for (const [command, changes] of [
    ['cat src/app.ts', false],
    ["sed -i 's/a/b/' src/app.ts", true],
    ['find . -name "*.tmp" -delete', true],
    ['find . -name "*.log" -exec rm {} \;', true],
    ["sed -n '1,5p' src/app.ts", false],
    ['git branch -m renamed', true],
    ['git branch --list', false],
    ['git remote update', true],
    ['git remote -v', false],
    ['fd --exec=rm tmp', true],
  ] as const) {
    const before = gitRuns()
    await $.tool.call({ tool: 'Bash', command } as never)
    await clock.advance(1_000)
    expect([command, gitRuns() > before]).toEqual([command, changes])
  }
})

test('reads between two writes never hide a conflict', async ($, on) => {
  const { toasts } = engine(on)
  await start($)
  await spawn($, 'Erster', 'general-purpose')
  await spawn($, 'Zweiter', 'general-purpose')
  await $.tool.call({ tool: 'Edit', file_path: '/work/a.ts', old_string: 'a', new_string: 'b', agentId: 'a1' } as never)
  for (let i = 0; i < 15; i++) await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/work/a.ts', old_string: 'b', new_string: 'c', agentId: 'a2' } as never)
  expect(toasts.some(t => t.includes('a.ts') && t.includes('Erster') && t.includes('Zweiter'))).toBe(true)
})

test("clearing finished agents lifts a focus on one of them", async ($, on) => {
  engine(on)
  await start($)
  await spawn($, 'Erster', 'general-purpose')
  await $.tool.call({ tool: 'Read', file_path: '/work/a.ts', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/work/b.ts' } as never)
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'Fertig.', turnId: 't1' } as never)
  const ui = await mount($, 'desktop')
  await showTab(ui, 'desktop', 'done')
  await openRun(ui, 'desktop', 'a1')
  await ui.press({ key: 'focus-a1' })
  expect(JSON.stringify(await ui.drawn())).toContain('"key":"focus-clear"')
  await ui.press({ key: 'clear' })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).not.toContain('"key":"focus-clear"')
  // Nothing in the tree stays dimmed.
  expect(drawn).not.toMatch(/"t":"b\.ts"[^}]*"dim":true/)
})

test('a failed update check is tried again within the hour, not after a day', async ($, on) => {
  const { clock } = engine(on)
  mock.store(on)
  on('fs.read', (_$, e) => ({ value: (e as { path: string }).path.endsWith('plugin.json') ? JSON.stringify({ version: '0.6.0', repository: 'https://github.com/jduerrmann/agent-crew' }) : '' }) as never)
  let asked = 0
  on('http.fetch', () => (asked++, asked === 1 ? { value: { status: 503, ok: false, headers: {}, text: 'down' } } : { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ version: '9.9.9' }) } }) as never)
  await start($)
  await clock.advance(6_000)
  expect(asked).toBe(1)
  await clock.advance(3_600_000)
  expect(asked).toBe(2)
})

test('versions compare as semver does: a release outranks its pre-releases', () => {
  expect(isNewer('1.0.0', '1.0.0-beta.1')).toBe(true)
  expect(isNewer('1.0.0-beta.1', '1.0.0')).toBe(false)
  expect(isNewer('1.0.0-beta.11', '1.0.0-beta.2')).toBe(true)
  expect(isNewer('0.10.0', '0.9.2')).toBe(true)
  expect(isNewer('0.7.0+build.5', '0.7.0')).toBe(false)
})

test('two update checks at once make one request', async ($, on) => {
  const { clock } = engine(on)
  mock.store(on)
  on('fs.read', (_$, e) => ({ value: (e as { path: string }).path.endsWith('plugin.json') ? JSON.stringify({ version: '0.6.0', repository: 'https://github.com/jduerrmann/agent-crew' }) : '' }) as never)
  // GitHub answers only once both presses are in: the second must join the first.
  let asked = 0
  const answers: (() => void)[] = []
  on('http.fetch', () => {
    asked++
    return new Promise(done => answers.push(() => done({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ version: '9.9.9' }) } }))) as never
  })
  await start($)
  const settings = await $.ui.mount({ plugin: 'agent-crew', surface: 'terminal', component: 'Pane', requestId: 'agent-crew-settings', props: SETTINGS_PROPS })
  await settings.press({ key: 'update-check' })
  await clock.advance(5)
  await settings.press({ key: 'update-check' })
  await clock.advance(5)
  expect(asked).toBe(1)
  for (const answer of answers) answer()
})

test('a forced update check that meets a lesser one under way runs after it', async ($, on) => {
  const { clock } = engine(on)
  mock.store(on)
  on('fs.read', (_$, e) => ({ value: (e as { path: string }).path.endsWith('plugin.json') ? JSON.stringify({ version: '0.6.0', repository: 'https://github.com/jduerrmann/agent-crew' }) : '' }) as never)
  let asked = 0
  const answers: (() => void)[] = []
  on('http.fetch', () => {
    asked++
    return new Promise(done => answers.push(() => done({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ version: '0.6.0' }) } }))) as never
  })
  await start($)
  // The daily look at the start, held at GitHub; then the button.
  await clock.advance(6_000)
  expect(asked).toBe(1)
  const settings = await $.ui.mount({ plugin: 'agent-crew', surface: 'terminal', component: 'Pane', requestId: 'agent-crew-settings', props: SETTINGS_PROPS })
  await settings.press({ key: 'update-check' })
  await clock.advance(5)
  expect(asked).toBe(1)
  answers.shift()?.()
  await clock.advance(5)
  expect(asked).toBe(2)
  for (const answer of answers) answer()
})

test('a commit whose files git cannot list this time is booked on the next look', async ($, on) => {
  let head = 'a'.repeat(40)
  let isDiffDown = false
  const { clock } = engine(on, [], argv => {
    const git = argv.slice(argv.indexOf('-C') + 2)
    if (git[0] === 'rev-parse' && git[1] === '--show-cdup') return { exitCode: 0, stdout: '\n' }
    if (git[0] === 'rev-parse') return { exitCode: 0, stdout: head + '\n' }
    if (git[0] === 'status') return { exitCode: 0, stdout: '## main\0' }
    if (git[0] === 'diff' && git[1] === '--name-only') return isDiffDown ? { exitCode: 128, stdout: '', stderr: 'busy' } : { exitCode: 0, stdout: 'src/app.ts\0' }
    return { exitCode: 0, stdout: '' }
  })
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' } as never)
  await clock.advance(1_000)
  // A commit, but git cannot list its files this time.
  head = 'b'.repeat(40)
  isDiffDown = true
  await $.tool.call({ tool: 'Bash', command: 'git commit -m x' } as never)
  await clock.advance(1_000)
  const ui = await mount($, 'terminal')
  await expandAll(ui)
  expect(JSON.stringify(await ui.drawn())).not.toContain('bbbbbbb')
  // The next look lists them: the commit is booked after all.
  isDiffDown = false
  await $.tool.call({ tool: 'Bash', command: 'git status --short && touch x' } as never)
  await clock.advance(1_000)
  expect(JSON.stringify(await ui.drawn())).toContain('✓ bbbbbbb')
})

test('a commit made outside the session shows within ten seconds while the pane is open, with no ↻ to press', async ($, on) => {
  const state = { head: 'a'.repeat(40) }
  const { clock } = engine(on, [], fakeGit(state), [{ id: 'agent-crew', isShown: true, isPlaced: true }])
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' } as never)
  await clock.advance(1_000)
  const ui = await mount($, 'terminal')
  expect(await ui.find({ key: 'files-refresh' })).toBeUndefined()
  // A commit in the person's own terminal: no tool call tells the mod.
  state.head = 'b'.repeat(40)
  await clock.advance(11_000)
  await expandAll(ui)
  expect(JSON.stringify(await ui.drawn())).toContain('✓ bbbbbbb')
})

test('a file just touched shows, shimmering, inside folders that are shut, and they shut again after', async ($, on) => {
  const { clock } = engine(on)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/auth/tokens.ts' } as never)
  const ui = await mount($, 'terminal')
  // Its folders open while it shimmers.
  expect(await hasRow(ui, '/work/src/auth/tokens.ts')).toBe(true)
  expect(JSON.stringify(await ui.drawn())).toContain('"sh":"read"')
  // Then they shut again: nobody opened them.
  await clock.advance(10_000)
  expect(await hasRow(ui, '/work/src/auth/tokens.ts')).toBe(false)
})

// A small git for the tests: HEAD, whether rev-parse and merge-base answer, a file list.
function fakeGit(state: { head: string; isHeadDown?: boolean; isAncestor?: boolean; names?: string }) {
  return (argv: string[]) => {
    const git = argv.slice(argv.indexOf('-C') + 2)
    if (git[0] === 'rev-parse' && git[1] === '--show-cdup') return { exitCode: 0, stdout: '\n' }
    if (git[0] === 'rev-parse') return state.isHeadDown ? { exitCode: 128, stdout: '', stderr: 'timeout' } : { exitCode: 0, stdout: state.head + '\n' }
    if (git[0] === 'status') return { exitCode: 0, stdout: '## main\u0000' }
    if (git[0] === 'merge-base') return state.isAncestor === false ? { exitCode: 1, stdout: '' } : { exitCode: 0, stdout: '' }
    if (git[0] === 'diff' && git[1] === '--name-only') return { exitCode: 0, stdout: state.names ?? 'src/app.ts\u0000' }
    if (git[0] === 'ls-tree') return { exitCode: 0, stdout: 'src/app.ts\u0000src/other.ts\u0000README.md\u0000' }
    return { exitCode: 0, stdout: '' }
  }
}

test('a failed rev-parse does not book the whole repository as committed', async ($, on) => {
  const state = { head: 'a'.repeat(40), isHeadDown: false }
  const { clock } = engine(on, [], fakeGit(state))
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' } as never)
  await clock.advance(1_000)
  state.isHeadDown = true
  await $.tool.call({ tool: 'Bash', command: 'touch x' } as never)
  await clock.advance(1_000)
  state.isHeadDown = false
  await $.tool.call({ tool: 'Bash', command: 'touch y' } as never)
  await clock.advance(1_000)
  const ui = await mount($, 'terminal')
  await expandAll(ui)
  // Nothing from ls-tree: the repository had commits all along.
  expect(await hasRow(ui, '/work/README.md')).toBe(false)
  expect(JSON.stringify(await ui.drawn())).not.toContain('✓ aaaaaaa')
})

test('a checkout to another branch books nothing as committed', async ($, on) => {
  const state = { head: 'a'.repeat(40), isAncestor: true }
  const { clock } = engine(on, [], fakeGit(state))
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' } as never)
  await clock.advance(1_000)
  state.head = 'c'.repeat(40)
  state.isAncestor = false
  await $.tool.call({ tool: 'Bash', command: 'git checkout other' } as never)
  await clock.advance(1_000)
  const ui = await mount($, 'terminal')
  await expandAll(ui)
  expect(JSON.stringify(await ui.drawn())).not.toContain('ccccccc')
})

// The drawn row with this id, from a rows Client's props.
async function rowOf(ui: Mounted, id: string): Promise<{ right: { t: string; c?: string }[] } | undefined> {
  let row: { right: { t: string }[] } | undefined
  JSON.stringify(await ui.drawn(), (_k, v) => {
    if (v && typeof v === 'object' && v.id === id && Array.isArray(v.right)) row = v
    return v
  })
  return row
}

test('under All an untouched file has no sign and a bright name, apart from the grey folders', async ($, on) => {
  const { clock } = engine(on)
  const entry = (name: string, kind: 'file' | 'dir') => ({ name, kind, size: 1, mtimeMs: 0, isLink: false })
  const listing: Record<string, ReturnType<typeof entry>[]> = { '/work': [entry('src', 'dir')], '/work/src': [entry('app.ts', 'file'), entry('idle.ts', 'file')] }
  on('fs.list', (_$, e) => ({ value: listing[(e as { path: string }).path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')] ?? [] }) as never)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' } as never)
  await clock.advance(10_000)
  const ui = await mount($, 'terminal')
  await ui.press({ key: 'files-filter-all' })
  await clock.advance(10)
  await expandAll(ui)
  const row = (await rowOf(ui, '/work/src/idle.ts')) as { left: { t: string; dim?: boolean }[] } | undefined
  expect(row?.left.map(s => s.t).join('')).toBe('    idle.ts')
  expect(row?.left.find(s => s.t === 'idle.ts')?.dim).toBeUndefined()
  const folder = (await rowOf(ui, 'dir:/src')) as { left: { dim?: boolean }[] } | undefined
  expect(folder?.left[0]?.dim).toBe(true)
})

test('a shut folder counts the files inside it by state and shows their agents', async ($, on) => {
  const { clock } = engine(on)
  const entry = (name: string, kind: 'file' | 'dir') => ({ name, kind, size: 1, mtimeMs: 0, isLink: false })
  const listing: Record<string, ReturnType<typeof entry>[]> = { '/work': [entry('src', 'dir')], '/work/src': [entry('app.ts', 'file'), entry('idle.ts', 'file'), entry('util.ts', 'file')] }
  on('fs.list', (_$, e) => ({ value: listing[(e as { path: string }).path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')] ?? [] }) as never)
  await start($)
  await spawn($, 'Umbauen', 'general-purpose')
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/app.ts', old_string: 'a', new_string: 'b', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/util.ts' } as never)
  await clock.advance(10_000)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    const signs = async () => (await rowOf(ui, 'dir:/src'))?.right.map(s => s.t).join('')
    expect(await signs()).toBe('✎1 ◉1 ●●   ')
    // The dots are the two agents': the subagent's colour and the main thread's.
    expect(new Set((await rowOf(ui, 'dir:/src'))?.right.filter(s => s.t === '●').map(s => s.c)).size).toBe(2)
    // Every file under the root: the untouched one counts for nothing.
    await ui.press({ key: 'files-filter-all' })
    await clock.advance(10)
    expect(await signs()).toBe('✎1 ◉1 ●●   ')
    await ui.press({ key: 'files-filter-activity' })
    // Open, its rows speak for themselves.
    await clickRow(ui, 'rows-a', 0)
    expect(await signs()).toBe('')
    await clock.advance(1000)
    await clickRow(ui, 'rows-a', 0)
    await clock.advance(1000)
  }
})

test('a deleted file shows as a red ✗, in its row, its folder and the legend', async ($, on) => {
  const git = fakeGit({ head: 'a'.repeat(40) })
  const { clock } = engine(on, [], argv =>
    argv.includes('status') ? { exitCode: 0, stdout: '## main\u0000 D src/old.ts\u0000 M src/app.ts\u0000' } : git(argv),
  )
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'rm src/old.ts' } as never)
  await clock.advance(10_000)
  const ui = await mount($, 'terminal')
  // Only git saw the Bash command's work: it shows under Changes.
  await ui.press({ key: 'files-filter-changed' })
  expect((await rowOf(ui, 'dir:/src'))?.right.map(s => s.t).join('')).toBe('✎1 ✗1   ')
  expect((await rowOf(ui, 'dir:/src'))?.right.find(s => s.t === '✗1 ')?.c).toBe('#ef4444')
  await expandAll(ui)
  const row = (await rowOf(ui, '/work/src/old.ts')) as { left: { t: string; c?: string }[]; right: { t: string; c?: string }[] } | undefined
  expect(row?.left.find(s => s.t === '✗ ')?.c).toBe('#ef4444')
  expect(row?.right.find(s => s.t === ' gelöscht')?.c).toBe('#ef4444')
  expect(await ui.find({ text: /gelöscht/ })).toBeDefined()
  // In a narrow pane the header's filters wrap, and the legend breaks between entries, never inside one.
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('✗ gelöscht')
  expect(drawn).toMatch(/"key":"files-head"[^}]*"flexWrap":"wrap"|"flexWrap":"wrap"[^}]*"key":"files-head"/)
})

test("Activity holds what the agents read and changed, Changes what git reports, whoever made it", async ($, on) => {
  const git = fakeGit({ head: 'a'.repeat(40) })
  const { clock } = engine(on, [], argv =>
    argv.includes('status') ? { exitCode: 0, stdout: '## main\u0000 M src/app.ts\u0000 M src/elsewhere.ts\u0000' } : git(argv),
  )
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/notes.ts' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/app.ts', old_string: 'a', new_string: 'b' } as never)
  await clock.advance(10_000)
  const ui = await mount($, 'terminal')
  await expandAll(ui)
  // Activity: the file only read, and the one read and changed; not the one changed in another editor.
  expect(await hasRow(ui, '/work/src/notes.ts')).toBe(true)
  expect(await hasRow(ui, '/work/src/app.ts')).toBe(true)
  expect(await hasRow(ui, '/work/src/elsewhere.ts')).toBe(false)
  await ui.press({ key: 'files-filter-changed' })
  await expandAll(ui)
  expect(await hasRow(ui, '/work/src/notes.ts')).toBe(false)
  expect(await hasRow(ui, '/work/src/app.ts')).toBe(true)
  expect(await hasRow(ui, '/work/src/elsewhere.ts')).toBe(true)
})

test('a new file, untracked or staged as added, shows as a blue +, in its row, its folder and the legend', async ($, on) => {
  const git = fakeGit({ head: 'a'.repeat(40) })
  const { clock } = engine(on, [], argv =>
    argv.includes('status') ? { exitCode: 0, stdout: '## main\u0000?? src/fresh.ts\u0000A  src/staged.ts\u0000 M src/app.ts\u0000' } : git(argv),
  )
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'touch src/fresh.ts' } as never)
  await clock.advance(10_000)
  const ui = await mount($, 'terminal')
  await ui.press({ key: 'files-filter-changed' })
  expect((await rowOf(ui, 'dir:/src'))?.right.map(s => s.t).join('')).toBe('✎1 +2   ')
  expect((await rowOf(ui, 'dir:/src'))?.right.find(s => s.t === '+2 ')?.c).toBe('#3b82f6')
  await expandAll(ui)
  for (const name of ['fresh.ts', 'staged.ts']) {
    const row = (await rowOf(ui, `/work/src/${name}`)) as { left: { t: string; c?: string }[]; right: { t: string; c?: string }[] } | undefined
    expect(row?.left.find(s => s.t === '+ ')?.c).toBe('#3b82f6')
    expect(row?.right.find(s => s.t === ' neu')?.c).toBe('#3b82f6')
  }
  const app = (await rowOf(ui, '/work/src/app.ts')) as { left: { t: string; c?: string }[] } | undefined
  expect(app?.left.find(s => s.t === '✎ ')?.c).toBe('#f97316')
  expect(await ui.find({ text: /neu/ })).toBeDefined()
})

// The model beneath: each request answers with the context `tokens.n` sets.
function modelSteps(on: On) {
  const tokens = { n: 0 }
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: { model: 'claude-opus-5-5', input_tokens: tokens.n, output_tokens: 0 } } as never
  })
  return tokens
}

// One model request of a subagent.
async function step($: Engine, agentId: string) {
  const s = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1, agentId } as never)
  for await (const _ of s);
  return s.result
}

// The terminal's bar of an agent row: one text of twenty cells, in eighths
// (the usage meters split theirs in two).
const barText = async (ui: Mounted) => /"([░█▏▎▍▌▋▊▉]{20})"/.exec(JSON.stringify(await ui.drawn()))?.[1] ?? ''
// How full it is, in eighths of a cell.
const eighthsOf = (bar: string) => [...bar].reduce((n, c) => n + (c === '█' ? 8 : Math.max(0, '▏▎▍▌▋▊▉'.indexOf(c) + 1)), 0)

test("an agent's bar estimates: it grows with time and steps, stops short of full, and fills when done", async ($, on) => {
  const { clock } = engine(on)
  const tokens = modelSteps(on)
  await start($)
  await spawn($, 'Tests reparieren', 'Explore')
  // A third of the window: the old bar stood a third full and stayed there.
  tokens.n = 333_000
  await step($, 'a1')
  const ui = await mount($, 'terminal')
  expect(await ui.find({ text: /ctx 33%/ })).toBeDefined()
  expect(await ui.find({ text: /1 Schritt/ })).toBeDefined()
  const atStart = eighthsOf(await barText(ui))
  expect(atStart).toBeLessThan(8 * 3)
  // A minute on, it has grown.
  await clock.advance(60_000)
  const aMinuteOn = eighthsOf(await barText(ui))
  expect(aMinuteOn).toBeGreaterThan(atStart)
  // A step more, more still.
  await step($, 'a1')
  expect(eighthsOf(await barText(ui))).toBeGreaterThan(aMinuteOn)
  // However long it runs, it stays short of full until it ends.
  await clock.advance(300_000)
  expect(eighthsOf(await barText(ui))).toBeLessThanOrEqual(8 * 18)
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'Fertig.', turnId: 't1' } as never)
  await ui.pointer({ type: 'down', x: 16, y: 1, button: 'left', in: 'tabs' })
  expect(await barText(ui)).toBe('█'.repeat(20))
})

test('on the desktop a running estimate glides to where it will stand a second on', async ($, on) => {
  engine(on)
  await start($)
  await spawn($, 'Tests reparieren', 'Explore')
  const desk = await mount($, 'desktop')
  const scale = Number(/scaleX\(([\d.]+)\)/.exec(JSON.stringify(await desk.drawn()))?.[1])
  expect(scale).toBeGreaterThan(0)
  expect(scale).toBeLessThan(1)
  // Ended, it stands still.
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'Fertig.', turnId: 't1' } as never)
  expect(JSON.stringify(await desk.drawn())).not.toContain('scaleX(')
})

// The drawn element with this key, as JSON.
async function drawnPart(ui: Mounted, key: string): Promise<string> {
  let part: unknown
  JSON.stringify(await ui.drawn(), (_k, v) => {
    if (v && typeof v === 'object' && v.props?.key === key) part = v
    return v
  })
  return JSON.stringify(part ?? null)
}

test('on the desktop a running dot pulses in a Client, in its row and on the Active tab; pictures hold no pulse', async ($, on) => {
  const { clock } = engine(on)
  await start($)
  await spawn($, 'Tests reparieren', 'Explore')
  const desk = await mount($, 'desktop')
  // Each picture says what it shows: the desktop draws none with an empty alt.
  const alts: string[] = []
  JSON.stringify(await desk.drawn(), (_k, v) => {
    if (v && typeof v === 'object' && v.type === 'Svg') alts.push(String(v.props?.alt ?? ''))
    return v
  })
  expect(alts.filter(a => !a.trim())).toEqual([])
  // The desktop reloads pictures on each redraw, which cuts a CSS pulse off: the
  // dots pulse in Clients, which keep their timer, and no picture tries.
  const pulses = (part: string) => part.includes('"pulse":true')
  expect(pulses(await drawnPart(desk, 'row-a1'))).toBe(true)
  expect(pulses(await drawnPart(desk, 'tabbox-active'))).toBe(true)
  expect(JSON.stringify(await desk.drawn())).not.toContain('class=\\"live\\"')
  // The crab is a still of its walk at the clock's time, and the pane redraws it
  // a quarter second on: a flip book that no reload can cut off.
  const still = async () => /run flip\\" style=\\"--t:([\d.]+)s/.exec(await drawnPart(desk, 'row-a1'))?.[1]
  await clock.advance(1000)
  const first = await still()
  expect(first).toBeDefined()
  await clock.advance(250)
  expect(await still()).not.toBe(first)
  // A press anywhere on the row opens it, and again shuts it: a click region over
  // the picture takes it on the press, so it lands between redraws.
  await openRun(desk, 'desktop', 'a1')
  expect(await drawnPart(desk, 'row-a1')).toContain('▾')
  await openRun(desk, 'desktop', 'a1')
  expect(await drawnPart(desk, 'row-a1')).toContain('▸')
  // With the keys, Enter does what the press does.
  await desk.key({ key: 'return', in: 'rowhit-a1' })
  expect(await drawnPart(desk, 'row-a1')).toContain('▾')
  await desk.key({ key: 'return', in: 'rowhit-a1' })
  // Ended, the mark is a still picture, and the tab stops pulsing.
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'Fertig.', turnId: 't1' } as never)
  expect(pulses(await drawnPart(desk, 'tabbox-active'))).toBe(false)
  await showTab(desk, 'desktop', 'done')
  expect(pulses(await drawnPart(desk, 'row-a1'))).toBe(false)
})

test('crabMotion light keeps the crabs on their own animation, without the flip book', { options: { crabMotion: 'light' } }, async ($, on) => {
  const { clock } = engine(on)
  await start($)
  await spawn($, 'Tests reparieren', 'Explore')
  const desk = await mount($, 'desktop')
  await clock.advance(1000)
  const row = await drawnPart(desk, 'row-a1')
  expect(row).toContain(' run\\"')
  expect(row).not.toContain('run flip')
  // No redraw a quarter second on: the pane keeps its once-a-second pace.
  await clock.advance(250)
  expect(await drawnPart(desk, 'row-a1')).toBe(row)
})

// The band above the prompt, with what draws beneath it: the engine's own
// nothing, or another plugin's band.
function beneathBand(on: On, other?: () => unknown) {
  on('ui.render', { component: 'AbovePrompt' }, () => (other?.() ?? { type: 'engine', ref: 0 }) as never)
}
const mountBand = ($: Engine, surface: Surface, extra: Record<string, unknown> = {}) =>
  $.ui.mount({
    plugin: 'agent-crew',
    surface,
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 9 }, view: {}, ...extra },
  } as never)
type Band = Awaited<ReturnType<typeof mountBand>> & Pick<Mounted, 'pointer'>
// What the band shows: its text segments on the terminal, its pictures' sources on the desktop.
const bandText = async (ui: Band) => {
  const texts: string[] = []
  JSON.stringify(await ui.drawn(), (_k, v) => {
    if (v && typeof v === 'object' && typeof v.t === 'string') texts.push(v.t)
    if (v && typeof v === 'object' && v.type === 'Svg') texts.push(String(v.props?.source))
    return v
  })
  return texts.join('')
}

test('the band above the prompt shows the crew, and a click on it opens the pane', async ($, on) => {
  const { opened, clock } = engine(on)
  beneathBand(on)
  await start($)
  for (const surface of SURFACES) {
    const before = await mountBand($, surface)
    // No agent yet: the band stays the engine's.
    expect(JSON.stringify(await before.drawn())).not.toContain('crew-band')
    await before.unmount()
  }
  await spawn($, 'Tests reparieren', 'Explore')
  await spawn($, 'Plan', 'Plan')
  await $.turn.complete({ agentId: 'a2', reason: 'answer', answer: 'Fertig.', turnId: 't2' } as never)
  for (const surface of SURFACES) {
    const band = (await mountBand($, surface)) as Band
    const text = await bandText(band)
    expect(text).toContain('1 Subagent aktiv')
    expect(text).toContain('1 fertig')
    // On the desktop the running agent walks as its crab; on the terminal it is a dot in its colour.
    if (surface === 'desktop') expect(text).toContain('c-pirate run flip')
    else expect(text).toContain('●')
    // The usage and progress lines are off by default.
    expect(text).not.toContain('Kontext')
    opened.length = 0
    // Opened in a dispatch of its own, after the click.
    await band.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'band-0' })
    await clock.advance(10)
    expect(opened).toEqual(['agent-crew'])
    await band.unmount()
  }
  // With every agent finished, the count says what it counts.
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'Fertig.', turnId: 't1' } as never)
  for (const surface of SURFACES) {
    const band = (await mountBand($, surface)) as Band
    expect(await bandText(band)).toContain('2 Subagenten fertig')
    await band.unmount()
  }
})

test('the band yields to a survey, and keeps another plugin’s band beneath its own', async ($, on) => {
  engine(on)
  beneathBand(on, () => ({ type: 'Text', props: {}, children: ['savvy band'] }))
  await start($)
  await spawn($, 'Tests reparieren', 'Explore')
  const band = await mountBand($, 'terminal')
  const drawn = JSON.stringify(await band.drawn())
  expect(drawn).toContain('crew-band')
  expect(drawn).toContain('savvy band')
  const survey = await mountBand($, 'terminal', { hasSurvey: true })
  expect(JSON.stringify(await survey.drawn())).not.toContain('crew-band')
})

test(
  'band options: progress and usage lines on, the crew line and the status line off',
  { options: { bandAgents: false, bandProgress: true, bandUsage: true, statusLine: false } },
  async ($, on) => {
    const { status, clock } = engine(on)
    beneathBand(on)
    const compacts: string[] = []
    on('command.run', { command: 'compact' }, () => (compacts.push('compact'), { text: '' }) as never)
    await start($)
    const resetsAt = new Date((await clock.now()) + 80 * 60_000).toISOString()
    await $.session.measure({ context: { percent: 31, tokens: 62000, window: 200000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 83, resetsAt }], changed: ['context', 'rateLimits'] } as never)
    await spawn($, 'Tests reparieren', 'Explore')
    for (const surface of SURFACES) {
      const band = (await mountBand($, surface)) as Band
      const text = await bandText(band)
      expect(text).not.toContain('Subagent aktiv')
      expect(text).toContain('Tests reparieren')
      expect(text).toContain('Kontext')
      expect(text).toContain('31%')
      expect(text).toContain('83%')
      expect(text).toMatch(/1h (19|20)m/)
      if (surface === 'desktop') {
        // The pane's usage rings, and the crab with its bar beside it.
        expect(text).toContain('stroke-dasharray')
        expect(text).toContain('c-pirate run flip')
      } else expect(text).toMatch(/[█▏▎▍▌▋▊▉░]{6}/)
      // /compact beside the usage runs the command, as the pane's button does.
      expect(text).toContain('/compact')
      await band.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'band-compact' })
      await clock.advance(10)
      await band.unmount()
    }
    expect(compacts).toEqual(['compact', 'compact'])
    expect(status.filter(Boolean)).toEqual([])
  },
)

test('a click on the band brings the pane into view: a tab behind, or waiting unplaced', async ($, on) => {
  const state = engine(on, [], undefined, [{ id: 'agent-crew', isShown: false, isPlaced: true }])
  const crew = () => state.panes.find(p => p.id === 'agent-crew')
  beneathBand(on)
  await start($)
  await spawn($, 'Tests reparieren', 'Explore')
  const band = (await mountBand($, 'terminal')) as Band
  // A tab behind another: shown after the click.
  await band.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'band-0' })
  expect(crew()).toEqual({ id: 'agent-crew', isShown: true, isPlaced: true })
  // Waiting unplaced: placed and shown after the click.
  Object.assign(crew() ?? {}, { isPlaced: false })
  await band.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'band-0' })
  expect(crew()).toEqual({ id: 'agent-crew', isShown: true, isPlaced: true })
  // In view already, a click leaves it open: never a toggle.
  await band.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'band-0' })
  expect(crew()).toEqual({ id: 'agent-crew', isShown: true, isPlaced: true })
})

test('/crew shows a pane that is open out of sight, and shuts only the one in view', async ($, on) => {
  const state = engine(on, [], undefined, [{ id: 'agent-crew', isShown: false, isPlaced: true }])
  await start($)
  const crew = () => state.panes.find(p => p.id === 'agent-crew')
  await $.command.run({ command: 'crew', args: '' } as never)
  expect(crew()).toEqual({ id: 'agent-crew', isShown: true, isPlaced: true })
  await $.command.run({ command: 'crew', args: '' } as never)
  expect(crew()).toBeUndefined()
})

test('the band counts waiting and stopped agents, and keeps conflicts once the agents are cleared', async ($, on) => {
  engine(on)
  beneathBand(on)
  await start($)
  await spawn($, 'Erster', 'general-purpose')
  await spawn($, 'Zweiter', 'general-purpose')
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/app.ts', old_string: 'a', new_string: 'b', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/app.ts', old_string: 'b', new_string: 'c', agentId: 'a2' } as never)
  await $.turn.complete({ agentId: 'a1', reason: 'aborted', answer: '', turnId: 't1' } as never)
  await $.turn.complete({ agentId: 'a2', reason: 'aborted', answer: '', turnId: 't2' } as never)
  for (const surface of SURFACES) {
    const band = (await mountBand($, surface)) as Band
    const text = await bandText(band)
    expect(text).toContain('2 Subagenten gestoppt')
    expect(text).toContain('1 Konflikt')
    await band.unmount()
  }
  // Cleared, the agents leave the band; their conflict stays, as it belongs to the file.
  const pane = await mount($, 'desktop')
  await showTab(pane, 'desktop', 'done')
  await pane.press({ key: 'clear' })
  for (const surface of SURFACES) {
    const band = (await mountBand($, surface)) as Band
    const text = await bandText(band)
    expect(text).not.toContain('gestoppt')
    expect(text).toContain('1 Konflikt')
    await band.unmount()
  }
})

test("the band's reset countdown moves with the pane shut", { options: { bandUsage: true } }, async ($, on) => {
  const { clock } = engine(on)
  beneathBand(on)
  await start($)
  const resetsAt = new Date((await clock.now()) + 80 * 60_000 + 30_000).toISOString()
  await $.session.measure({ context: { percent: 31, tokens: 62000, window: 200000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 40, resetsAt }], changed: ['context', 'rateLimits'] } as never)
  const band = (await mountBand($, 'terminal')) as Band
  expect(await bandText(band)).toContain('1h 20m')
  // No agent runs and no pane is open: the countdown still moves on.
  await clock.advance(61_000)
  expect(await bandText(band)).toContain('1h 19m')
})

test('a narrow desktop band keeps its counts whole and drops the crabs', async ($, on) => {
  engine(on)
  beneathBand(on)
  await start($)
  await spawn($, 'Tests reparieren', 'Explore')
  await spawn($, 'Plan', 'Plan')
  await $.turn.complete({ agentId: 'a2', reason: 'answer', answer: 'Fertig.', turnId: 't2' } as never)
  const band = (await mountBand($, 'desktop', { bodyColumns: 30 })) as Band
  const text = await bandText(band)
  expect(text).toContain('1 Subagent aktiv')
  expect(text).toContain('1 fertig')
  expect(text).not.toContain('run flip')
})

// Where the crew picture's counts end, as the picture measures text: their x
// plus the width of what they say, against the picture's width.
function countsExtent(source: string): { end: number; width: number; text: string } {
  const width = Number(/<svg[^>]* width="(\d+)"/.exec(source)?.[1])
  const m = /<text x="([\d.]+)" y="20" font-family="[^"]*" font-size="12.5">(.*?)<\/text>/.exec(source)
  const text = (m?.[2] ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  return { end: Number(m?.[1] ?? 0) + textWidth(text, 12.5), width, text }
}

test('the desktop band fits its counts to its width: words, then signs and numbers, then …', async ($, on) => {
  // Six kinds at once: running, waiting, done, stopped, failed, and a conflict.
  engine(on, [
    { id: 'w1', type: 'general-purpose', description: 'Wartet', status: 'idle' },
    { id: 'd1', type: 'general-purpose', description: 'Fertig', status: 'completed' },
    { id: 's1', type: 'general-purpose', description: 'Gestoppt', status: 'killed' },
    { id: 'f1', type: 'general-purpose', description: 'Fehler', status: 'failed' },
  ] as never)
  beneathBand(on)
  await start($)
  await spawn($, 'Läuft', 'Explore')
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/app.ts', old_string: 'a', new_string: 'b', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/app.ts', old_string: 'b', new_string: 'c', agentId: 'w1' } as never)
  const crewPicture = async (columns: number) => {
    const band = await mountBand($, 'desktop', { bodyColumns: columns })
    let source = ''
    JSON.stringify(await band.drawn(), (_k, v) => {
      if (v && typeof v === 'object' && v.type === 'Svg' && !source) source = String(v.props?.source)
      return v
    })
    await band.unmount()
    return countsExtent(source)
  }
  // Wide: in words, all six.
  const wide = await crewPicture(140)
  expect(wide.text).toContain('1 Subagent aktiv')
  expect(wide.text).toContain('1 wartet')
  expect(wide.text).toContain('1 Konflikt')
  expect(wide.end).toBeLessThanOrEqual(wide.width)
  // Narrower: signs and numbers, still inside the picture.
  const mid = await crewPicture(30)
  expect(mid.text).not.toContain('Subagent')
  expect(mid.text).toMatch(/● 1 {2}· {2}○ 1/)
  expect(mid.end).toBeLessThanOrEqual(mid.width)
  // Narrowest: the last ones give way to …, and nothing runs past the edge.
  const narrow = await crewPicture(20)
  expect(narrow.text).toContain('…')
  expect(narrow.end).toBeLessThanOrEqual(narrow.width)
})

test("a worker's reported steps fill its bar for real, with the step under way", async ($, on) => {
  engine(on)
  await start($)
  await spawn($, 'Umbau Auth', 'general-purpose')
  await $.tool.call({ tool: 'mcp__savvy-progress__step', done: 0, total: 5, agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/auth.ts', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'mcp__savvy-progress__step', done: 3, note: 'Tests schreiben', agentId: 'a1' } as never)
  const ui = await mount($, 'terminal')
  expect(await barText(ui)).toBe('█'.repeat(12) + '░'.repeat(8))
  expect(await ui.find({ text: /3\/5 · Tests schreiben/ })).toBeDefined()
  // The report is no action: the last one stays the read.
  expect(await ui.find({ text: /› Read/ })).toBeDefined()
  const desk = await mount($, 'desktop')
  expect(JSON.stringify(await desk.drawn())).toContain('3/5 · Tests schreiben')
})

// A to-do list as TodoWrite writes it: `done` steps completed, the next under way, the rest pending.
const todos = (names: string[], done: number) => ({
  todos: names.map((n, i) => ({ content: n, activeForm: `${n} läuft`, status: i < done ? 'completed' : i === done ? 'in_progress' : 'pending' })),
})

test("an agent's own to-do list fills its bar for real, with the step under way, and costs no call", async ($, on) => {
  engine(on)
  await start($)
  await spawn($, 'Umbau Auth', 'general-purpose')
  await $.tool.call({ tool: 'Read', file_path: '/work/src/auth.ts', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'TodoWrite', ...todos(['Lesen', 'Umbauen', 'Testen', 'Aufräumen', 'Melden'], 3), agentId: 'a1' } as never)
  const ui = await mount($, 'terminal')
  expect(await barText(ui)).toBe('█'.repeat(12) + '░'.repeat(8))
  expect(await ui.find({ text: /3\/5 · Aufräumen läuft/ })).toBeDefined()
  // Writing the list is no action: the last one stays the read.
  expect(await ui.find({ text: /› Read/ })).toBeDefined()
  // In the agent's log it reads as where the list stands, not as its tool's name twice.
  await openRun(ui, 'terminal', 'a1')
  const logged = /"children":\["TodoWrite"\]\}," ","([^"]*)"/.exec(JSON.stringify(await ui.drawn()))?.[1]
  expect(logged).toBe('3/5 · Aufräumen läuft')
  await ui.unmount()
  const desk = await mount($, 'desktop')
  expect(JSON.stringify(await desk.drawn())).toContain('3/5 · Aufräumen läuft')
})

test("TaskCreate and TaskUpdate keep an agent's tasks; its bar counts the completed ones", async ($, on) => {
  engine(on)
  await start($)
  await spawn($, 'Umbau Auth', 'general-purpose')
  for (const subject of ['Lesen', 'Umbauen', 'Testen']) await $.tool.call({ tool: 'TaskCreate', subject, description: subject, activeForm: `${subject} läuft`, agentId: 'a1' } as never)
  // Without an id in the result, a task goes by its subject.
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'Lesen', status: 'completed', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'Umbauen', status: 'in_progress', agentId: 'a1' } as never)
  const ui = await mount($, 'terminal')
  expect(await ui.find({ text: /1\/3 · Umbauen läuft/ })).toBeDefined()
  await ui.unmount()
  // A deleted task leaves the count.
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'Testen', status: 'deleted', agentId: 'a1' } as never)
  const after = await mount($, 'terminal')
  expect(await after.find({ text: /1\/2 · Umbauen läuft/ })).toBeDefined()
})

test("the main chat's to-do list shows beside it in the timeline while steps are open", async ($, on) => {
  const { clock } = engine(on)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  await start($)
  await $.turn.start({ text: 'Los', turnId: 't1' } as never)
  await $.tool.call({ tool: 'TodoWrite', ...todos(['Lesen', 'Umbauen', 'Testen'], 1) } as never)
  await clock.advance(10_000)
  for (const surface of SURFACES) expect(await timelineOf($, surface)).toContain('Hauptchat 1/3')
  // All done: the label is the main chat's alone again.
  await $.tool.call({ tool: 'TodoWrite', ...todos(['Lesen', 'Umbauen', 'Testen'], 3) } as never)
  for (const surface of SURFACES) {
    const tl = await timelineOf($, surface)
    expect(tl).toContain('Hauptchat')
    expect(tl).not.toContain('3/3')
  }
})

test('reading to-do lists: TodoWrite and the task calls, as pure functions', () => {
  expect(todoReport({})).toBeUndefined()
  expect(todoReport({ todos: [] })).toBeUndefined()
  expect(todoReport(todos(['a', 'b'], 1))).toEqual({ done: 1, total: 2, note: 'b läuft' })
  expect(todoReport(todos(['a', 'b'], 2))).toEqual({ done: 2, total: 2 })
  // A long step is cut to one line of 80 characters.
  expect(todoReport({ todos: [{ content: 'x', activeForm: `${'y'.repeat(100)}\nz`, status: 'in_progress' }] })?.note?.length).toBe(80)
  // The id comes from the result where there is one.
  let list = applyTask([], 'TaskCreate', { subject: 'Testen', activeForm: 'Testet' }, { task: { id: '7', subject: 'Testen' } }, 'main')
  expect(list).toEqual([{ id: '7', subject: 'Testen', activeForm: 'Testet', status: 'pending', agent: 'main' }])
  // Any agent may update it, and an update may give it to another.
  list = applyTask(list, 'TaskUpdate', { taskId: '7', status: 'in_progress', owner: 'a1' }, undefined, 'a2')
  const self = (o: string) => o
  expect(tasksReport(list, 'a1', self)).toEqual({ done: 0, total: 1, note: 'Testet' })
  expect(tasksReport(list, 'main', self)).toBeUndefined()
  // An empty owner hands it back to its maker.
  expect(holderOf(applyTask(list, 'TaskUpdate', { taskId: '7', owner: '' }, undefined, 'a1')[0] as never, self)).toBe('main')
  // An unknown task or another tool changes nothing.
  expect(applyTask(list, 'TaskUpdate', { taskId: '8', status: 'completed' }, undefined, 'main')).toEqual(list)
  expect(applyTask(list, 'Read', { file_path: 'x' }, undefined, 'main')).toEqual(list)
  expect(applyTask(list, 'TaskUpdate', { taskId: '7', status: 'deleted' }, undefined, 'a1')).toEqual([])
  expect(reportOf([])).toBeUndefined()
})

test('a task given to another agent counts for its new owner, whoever updates it', async ($, on) => {
  const { clock } = engine(on)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  await start($)
  await $.turn.start({ text: 'Los', turnId: 't1' } as never)
  await spawn($, 'Umbau Auth', 'general-purpose')
  await spawn($, 'Prüfen', 'general-purpose')
  // The main chat makes the task: it counts for the main chat.
  await $.tool.call({ tool: 'TaskCreate', subject: 'Testen', description: 'Testen', activeForm: 'Testen läuft' } as never)
  await clock.advance(1000)
  expect(await timelineOf($, 'terminal')).toContain('Hauptchat 0/1')
  // Given to a1: it leaves the main chat's count and joins a1's.
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'Testen', owner: 'a1' } as never)
  let tl = await timelineOf($, 'terminal')
  expect(tl).toContain('Hauptchat')
  expect(tl).not.toContain('0/1')
  // a1 works on it: its own update lands.
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'Testen', status: 'in_progress', agentId: 'a1' } as never)
  let ui = await mount($, 'terminal')
  expect(await ui.find({ text: /0\/1 · Testen läuft/ })).toBeDefined()
  await ui.unmount()
  // Handed on to a2 by a1: a1's bar goes back to the estimate, a2's shows the task.
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'Testen', owner: 'a2', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'Testen', status: 'completed', agentId: 'a2' } as never)
  ui = await mount($, 'terminal')
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('1/1')
  expect(drawn).not.toContain('0/1')
  await ui.unmount()
  tl = await timelineOf($, 'terminal')
  expect(tl).not.toContain('/1')
})

test('an emptied list takes the bar back to the estimate: TodoWrite with no steps, or the last task deleted', async ($, on) => {
  engine(on)
  await start($)
  await spawn($, 'Umbau Auth', 'general-purpose')
  await $.tool.call({ tool: 'TodoWrite', ...todos(['Lesen', 'Umbauen', 'Testen'], 1), agentId: 'a1' } as never)
  let ui = await mount($, 'terminal')
  expect(await ui.find({ text: /1\/3 · Umbauen läuft/ })).toBeDefined()
  await ui.unmount()
  await $.tool.call({ tool: 'TodoWrite', todos: [], agentId: 'a1' } as never)
  ui = await mount($, 'terminal')
  expect(await ui.find({ text: /1\/3/ })).toBeUndefined()
  await ui.unmount()
  // The same through the task calls: the last one deleted.
  await $.tool.call({ tool: 'TaskCreate', subject: 'Testen', description: 'Testen', activeForm: 'Testen läuft', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'Testen', status: 'in_progress', agentId: 'a1' } as never)
  ui = await mount($, 'terminal')
  expect(await ui.find({ text: /0\/1 · Testen läuft/ })).toBeDefined()
  await ui.unmount()
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'Testen', status: 'deleted', agentId: 'a1' } as never)
  ui = await mount($, 'terminal')
  expect(await ui.find({ text: /0\/1/ })).toBeUndefined()
})

test('a file changed and restored leaves Changes, and stays in Activity', async ($, on) => {
  const state = { status: '## main\u0000 M src/app.ts\u0000' }
  const git = fakeGit({ head: 'a'.repeat(40) })
  const { clock } = engine(on, [], argv => (argv.includes('status') ? { exitCode: 0, stdout: state.status } : git(argv)))
  await start($)
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/app.ts', old_string: 'a', new_string: 'b' } as never)
  await clock.advance(10_000)
  const ui = await mount($, 'terminal')
  await ui.press({ key: 'files-filter-changed' })
  await expandAll(ui)
  expect(await hasRow(ui, '/work/src/app.ts')).toBe(true)
  // Restored: git sees it clean again.
  state.status = '## main\u0000'
  await $.tool.call({ tool: 'Bash', command: 'git restore src/app.ts' } as never)
  await clock.advance(10_000)
  await expandAll(ui)
  expect(await hasRow(ui, '/work/src/app.ts')).toBe(false)
  await ui.press({ key: 'files-filter-activity' })
  await expandAll(ui)
  expect(await hasRow(ui, '/work/src/app.ts')).toBe(true)
})

test('a press shuts a folder a fresh file holds open, and it stays shut', async ($, on) => {
  const { clock } = engine(on)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' } as never)
  const ui = await mount($, 'terminal')
  expect(await hasRow(ui, '/work/src/app.ts')).toBe(true)
  await clickRow(ui, 'rows-a', 0)
  expect(await hasRow(ui, '/work/src/app.ts')).toBe(false)
  await clock.advance(10_000)
  expect(await hasRow(ui, '/work/src/app.ts')).toBe(false)
  // New activity in it opens it again for its shimmer.
  await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' } as never)
  expect(await hasRow(ui, '/work/src/app.ts')).toBe(true)
})
