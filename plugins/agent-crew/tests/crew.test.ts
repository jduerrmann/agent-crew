import { expect, mock, test } from 'claude-code/testing'
import { isNewer } from '../hooks/files'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

const SURFACES = ['terminal', 'desktop'] as const
const PANE_PROPS = { title: 'Crew', isFocused: false, bodyColumns: 60, placement: 'dock' } as never

// Stands in for the engine beneath the mod: spawns answer with an id per call,
// the list holds what each test puts there, git is not a repository, UI calls
// are recorded, every tool call succeeds.
// `run` answers the commands the mod runs (git), else "not a git repository".
type RunAnswer = { exitCode: number; stdout: string; stderr?: string }
function engine(on: On, listed: AgentInfo[] = [], run?: (argv: string[]) => RunAnswer | undefined) {
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
  on('ui.open', (_$, e) => (opened.push(e.id), { value: { isPlaced: true as const } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.status', (_$, e) => (status.push(e.text), { value: undefined }))
  on('settings.read', () => ({ value: {} }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('turn.complete', (_$, e) => ({ text: '', usage: e.usage }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  const configSets: { key: string; value: unknown }[] = []
  on('config.list', () => ({ value: [] }))
  on('config.set', (_$, e) => (configSets.push({ key: e.key, value: e.value }), { value: e.value }))
  on('tool.call', () => ({ result: 'ok' }) as never)
  return { opened, status, toasts, clock, configSets, runs }
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
    const tabs = surface === 'desktop' ? 'tab-done' : 'tabs'
    expect(await ui.find({ key: tabs })).toBeDefined()
    expect(await ui.find({ key: 'd-a2' })).toBeDefined()
    expect(await ui.find({ key: 'd-a1' })).toBeUndefined()
    if (surface === 'desktop') await ui.press({ key: 'tab-done' })
    else await ui.pointer({ type: 'down', x: 16, y: 1, button: 'left', in: 'tabs' })
    expect(await ui.find({ key: 'd-a1' })).toBeDefined()
    expect(await ui.find({ key: 'clear' })).toBeDefined()
    if (surface === 'desktop') await ui.press({ key: 'tab-active' })
    else await ui.pointer({ type: 'down', x: 2, y: 1, button: 'left', in: 'tabs' })
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
    await ui.press({ key: 'd-a1' })
    expect(await ui.find({ text: /Read/ })).toBeDefined()
    expect(await ui.find({ text: /README\.md/ })).toBeDefined()
    expect(await ui.find({ key: 'files-toggle' })).toBeDefined()
    await ui.press({ key: 'd-a1' })
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
    expect(await ui.find({ key: 'd-a1' })).toBeUndefined()
    expect(await ui.find({ key: 'files-toggle' })).toBeDefined()
    expect(await ui.find({ key: 'run-compact' })).toBeDefined()
    await ui.press({ key: 'compact' })
    expect(await ui.find({ key: 'd-a1' })).toBeDefined()
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
  await ui.press({ key: 'tab-done' })
  expect(await ui.find({ key: 'd-x9' })).toBeDefined()
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
    expect(await ui.find({ key: 'd-a1' })).toBeUndefined()
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
  await $.prompt.edit({ text: 'a', cursor: 1, start: 0, end: 0, inputText: 'a' } as never)
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
  await ui.press({ key: 'tab-done' })
  await ui.press({ key: 'd-a1' })
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
