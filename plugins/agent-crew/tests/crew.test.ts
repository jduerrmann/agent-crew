import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

const SURFACES = ['terminal', 'desktop'] as const
const PANE_PROPS = { title: 'Crew', isFocused: false, bodyColumns: 60, placement: 'dock' } as never

// Stands in for the engine beneath the mod: spawns answer with an id per call,
// the list holds what each test puts there, git is not a repository, UI calls
// are recorded, every tool call succeeds.
function engine(on: On, listed: AgentInfo[] = []) {
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
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: 'not a git repository', isStdoutTruncated: false } }) as never)
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
  return { opened, status, toasts, clock, configSets }
}

const start = ($: Engine) => $.session.start({ cwd: '/work', surface: null, isInteractive: true })

const spawn = ($: Engine, description: string, subagentType: string) =>
  $.agent.spawn({ prompt: 'Lies die README.', description, subagentType } as never)

const mount = ($: Engine, surface: (typeof SURFACES)[number]) =>
  $.ui.mount({ plugin: 'agent-crew', surface, component: 'Pane', requestId: 'agent-crew', props: PANE_PROPS })

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
  const { toasts } = engine(on)
  await start($)
  await spawn($, 'Erster', 'general-purpose')
  await spawn($, 'Zweiter', 'general-purpose')
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/app.ts', old_string: 'a', new_string: 'b', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/app.ts', old_string: 'b', new_string: 'c', agentId: 'a2' } as never)
  expect(toasts.some(t => t.includes('app.ts') && t.includes('Erster') && t.includes('Zweiter'))).toBe(true)

  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect(JSON.stringify(await ui.drawn())).toContain('⚠')
    await ui.press({ key: 'file-/work/src/app.ts' })
    expect(await ui.find({ text: /Von mehreren Agenten geändert/ })).toBeDefined()
    expect(await ui.find({ text: /Verlauf/ })).toBeDefined()
    await ui.press({ key: 'file-/work/src/app.ts' })
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
  engine(on)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/app.ts' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/work/src/utils.ts' } as never)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect(await ui.find({ key: 'file-/work/src/app.ts' })).toBeDefined()
    await ui.input({ key: 'file-q', text: 'util', kind: 'change' })
    expect(await ui.find({ key: 'file-/work/src/app.ts' })).toBeUndefined()
    expect(await ui.find({ key: 'file-/work/src/utils.ts' })).toBeDefined()
    await ui.input({ key: 'file-q', text: 'util' })
    expect(await ui.find({ text: /Verlauf/ })).toBeDefined()
    await ui.press({ key: 'file-q-clear' })
    expect(await ui.find({ key: 'file-/work/src/app.ts' })).toBeDefined()
    await ui.press({ key: 'file-/work/src/utils.ts' })
  }
})

test('a freshly touched file shimmers on the desktop', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/app.ts', old_string: 'a', new_string: 'b' } as never)
  const ui = await mount($, 'desktop')
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('linearGradient')
  expect(drawn).toContain('animateTransform')
})
