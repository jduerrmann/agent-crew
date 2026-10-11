import { expect, mock, test } from 'claude-code/testing'
import { FONT, crab, svg, xml } from '../hooks/crab'
import { ascii, firstOf, renderPane, without } from './render'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

// The README's pictures, drawn by the mod itself from made-up sessions
// (decisions/privacy-before-push.md): each test plays one, mounts the desktop
// pane and lays out what it drew (tests/render.ts). With RENDER on, each prints
// `@@MEDIA <file> <svg>`; workflow.md says how to write them to media/. Off,
// the scenes still have to draw: a picture that breaks shows here first.
const RENDER = false

// The sandbox has a console; the mod's types (no DOM) do not know it.
declare const console: { log: (line: string) => void }

/** Columns of the pane; the pictures come out this × 8 + 32 px wide. */
const COLS = 103
const WIDTH = COLS * 8 + 32

const emit = (file: string, picture: string) => {
  expect(picture).toContain('<svg')
  if (RENDER) console.log(`@@MEDIA ${file} ${ascii(picture)}`)
}

const MIN = 60_000

type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }

// A made-up project at /work: git answers from `git`, models per spawn in turn.
function world(on: On, git: (args: string[]) => { exitCode: number; stdout: string } | undefined = () => undefined, models: string[] = []) {
  const clock = mock.clock(on)
  mock.env(on, { LANG: 'en_US.UTF-8' })
  let n = 0
  const step: { usage?: Usage & { model?: string }; answer?: string } = {}
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { percent: 0, tokens: 0, window: 200000 }, rateLimits: [] } }) as never)
  on('process.run', (_$, e) => {
    const argv = [...(e as { argv: string[] }).argv]
    const args = argv.includes('-C') ? argv.slice(argv.indexOf('-C') + 2) : argv
    const r = git(args) ?? { exitCode: 128, stdout: '', stderr: 'not a git repository' }
    return { value: { stderr: '', isStdoutTruncated: false, ...r } } as never
  })
  on('agent.spawn', () => ({ model: models[n] ?? 'claude-opus-5-5', agentId: `a${++n}` }))
  on('agent.list', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.panes', () => ({ value: [] }) as never)
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: undefined }) as never)
  on('settings.read', () => ({ value: {} }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('config.list', () => ({ value: [] }))
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: '', usage: e.usage }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: step.answer ?? '', toolUses: [], stopReason: 'tool_use', usage: step.usage } as never
  })
  return { clock, step }
}

const start = ($: Engine) => $.session.start({ cwd: '/work', surface: null, isInteractive: true })

type Spawn = { description: string; type: string; prompt?: string; parent?: string; background?: boolean; workflow?: number; teammate?: string }
const spawn = ($: Engine, s: Spawn) =>
  $.agent.spawn({
    prompt: s.prompt ?? s.description,
    description: s.description,
    subagentType: s.type,
    parentAgentId: s.parent,
    background: s.background ?? false,
    ...(s.workflow !== undefined ? { workflow: { runId: 'wf1', agentIndex: s.workflow } } : {}),
    ...(s.teammate ? { isTeammate: true, name: s.teammate } : {}),
  } as never)

// Model requests of an agent (or the main chat, without one), each adding `usage`.
async function steps($: Engine, w: ReturnType<typeof world>, agentId: string | undefined, count: number, usage: Usage, model = 'claude-opus-5-5', effort?: string) {
  for (let i = 0; i < count; i++) {
    w.step.usage = { ...usage, model }
    const s = $.turn.step({ turnId: `t-${agentId ?? 'main'}`, index: i, model, messageCount: i + 1, ...(agentId ? { agentId } : {}), ...(effort ? { effort } : {}) } as never)
    for await (const _ of s);
    await w.clock.advance(4000)
  }
  w.step.usage = undefined
}

const tool = ($: Engine, t: Record<string, unknown>) => $.tool.call(t as never)
// A turn of the main chat begins, or ends.
const turnStart = ($: Engine, turnId: string) => $.turn.start({ text: 'Go on', turnId } as never)
const turnEnd = ($: Engine, turnId: string) => $.turn.complete({ reason: 'answer', answer: 'Done.', turnId } as never)
const done = ($: Engine, agentId: string, answer = 'Done.', reason = 'answer') => $.turn.complete({ agentId, reason, answer, turnId: `t-${agentId}` } as never)

const mount = ($: Engine, requestId = 'agent-crew') =>
  $.ui.mount({ plugin: 'agent-crew', surface: 'desktop', component: 'Pane', requestId, props: { title: 'Crew', isFocused: false, bodyColumns: COLS, placement: 'dock' } as never })

const ONLY = { showUsage: false, showTotals: false, showAgents: false, showTimeline: false, showFiles: false }

// A section on its own, without the pane's Settings line above it.
type Mounted = Awaited<ReturnType<typeof mount>>
const section = async (ui: Mounted) => renderPane(without(await ui.drawn(), ['settings-row']), WIDTH)

// --- a session with a small team: Explore scouting, a refactor with a plan under
// it, a guide done, a workflow review that failed. Its files: a conflict on
// tokens.ts, a commit, a new file, a staged one and a deleted one.

/** The models the team's agents run on, a1 to a6. */
const TEAM_MODELS = ['claude-sonnet-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']

const HEAD1 ='9f2c1e4a7b3d5e6f8091a2b3c4d5e6f708192a3b'
const HEAD2 = '53c8216d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b'
const DIFF = [
  'diff --git a/src/auth/tokens.ts b/src/auth/tokens.ts',
  '--- a/src/auth/tokens.ts',
  '+++ b/src/auth/tokens.ts',
  '@@ -18,7 +18,9 @@ export class TokenStore {',
  '   private token?: string',
  '-  refresh() { return fetchToken(this.url) }',
  '+  async refresh() {',
  '+    this.token = await fetchToken(this.url)',
  '+    return this.token',
  '+  }',
  '   get expired() {',
].join('\n')

function teamGit() {
  const state = { head: HEAD1 }
  const answer = (args: string[]) => {
    if (args[0] === 'rev-parse' && args[1] === '--show-cdup') return { exitCode: 0, stdout: '\n' }
    if (args[0] === 'rev-parse') return { exitCode: 0, stdout: `${state.head}\n` }
    if (args[0] === 'status')
      return {
        exitCode: 0,
        stdout: ['## main...origin/main [ahead 1]', ' M src/auth/tokens.ts', 'A  src/auth/refresh.ts', '?? docs/MIGRATION.md', ' D src/legacy/cookies.ts', ''].join('\0'),
      }
    if (args[0] === 'diff' && args.includes('--numstat')) return { exitCode: 0, stdout: '42\t7\tsrc/auth/tokens.ts\x0018\t0\tsrc/auth/refresh.ts\x00' }
    if (args[0] === 'diff' && args.includes('--name-only')) return { exitCode: 0, stdout: 'src/index.ts\0src/auth/index.ts\0' }
    if (args[0] === 'diff') return { exitCode: 0, stdout: DIFF }
    if (args[0] === 'merge-base') return { exitCode: 0, stdout: '' }
    if (args[0] === 'ls-files') return { exitCode: 0, stdout: '' }
    return { exitCode: 0, stdout: '' }
  }
  return { state, answer }
}

async function team($: Engine, w: ReturnType<typeof world>, git: ReturnType<typeof teamGit>) {
  await start($)
  // The main chat's first turn, and its own requests for the cost section.
  await turnStart($, 'm1')
  await steps($, w, undefined, 6, { input_tokens: 2400, output_tokens: 1800, cache_read_input_tokens: 340_000, cache_creation_input_tokens: 4000 })
  // A guide answered a question early on.
  await spawn($, { description: 'Check the hooks API', type: 'claude-code-guide' })
  await steps($, w, 'a1', 3, { input_tokens: 900, output_tokens: 700, cache_read_input_tokens: 30_000 }, 'claude-sonnet-5-5')
  await done($, 'a1', 'tool.call fires for every tool, subagents included.')
  await w.clock.advance(MIN)
  // A workflow review that failed.
  await spawn($, { description: 'review: error handling', type: 'general-purpose', workflow: 0 })
  await steps($, w, 'a2', 2, { input_tokens: 1200, output_tokens: 400, cache_read_input_tokens: 25_000 }, 'claude-sonnet-5-5')
  await done($, 'a2', '', 'error')
  await turnEnd($, 'm1')
  await w.clock.advance(MIN)
  // The second turn, still at work: Explore scouts the auth module, the refactor starts beside it.
  await turnStart($, 'm2')
  await spawn($, { description: 'Map the auth module', type: 'Explore', prompt: 'Find where tokens are created, refreshed and stored in src/auth.' })
  await tool($, { tool: 'Read', file_path: '/work/src/legacy/cookies.ts', agentId: 'a3' })
  await steps($, w, 'a3', 4, { input_tokens: 1500, output_tokens: 600, cache_read_input_tokens: 41_000 }, 'claude-haiku-5-5')
  await spawn($, {
    description: 'Refactor the token store',
    type: 'general-purpose',
    prompt: 'Make TokenStore.refresh async and keep the token it fetched. Update the callers in src/auth and add a refresh helper. Run the tests when done.',
  })
  await steps($, w, 'a4', 3, { input_tokens: 3000, output_tokens: 2200, cache_read_input_tokens: 52_000, cache_creation_input_tokens: 6000 }, 'claude-opus-5-5', 'high')
  // The plan under the refactor, finished.
  await spawn($, { description: 'Plan the session migration', type: 'Plan', parent: 'a4' })
  await steps($, w, 'a5', 3, { input_tokens: 1400, output_tokens: 1600, cache_read_input_tokens: 28_000 }, 'claude-sonnet-5-5')
  await done($, 'a5', '1. Move the session type. 2. Swap the cookie store. 3. Write MIGRATION.md.')
  // A scout under the refactor, still at work.
  await spawn($, { description: 'Find the token callers', type: 'Explore', parent: 'a4' })
  await steps($, w, 'a6', 2, { input_tokens: 1100, output_tokens: 300, cache_read_input_tokens: 22_000 }, 'claude-haiku-5-5')
  await tool($, { tool: 'Grep', pattern: 'TokenStore', path: 'src', agentId: 'a6' } as never)
  // The main chat and the refactor both change tokens.ts: a conflict.
  await tool($, { tool: 'Read', file_path: '/work/src/auth/tokens.ts', agentId: 'a3' })
  await tool($, { tool: 'Edit', file_path: '/work/src/auth/tokens.ts', old_string: 'a', new_string: 'b', agentId: 'a4' })
  await tool($, { tool: 'Write', file_path: '/work/src/auth/refresh.ts', content: 'x', agentId: 'a4' })
  await steps($, w, 'a4', 4, { input_tokens: 2800, output_tokens: 2400, cache_read_input_tokens: 61_000 }, 'claude-opus-5-5', 'high')
  await tool($, { tool: 'Edit', file_path: '/work/src/auth/tokens.ts', old_string: 'b', new_string: 'c' })
  await tool($, { tool: 'Write', file_path: '/work/docs/MIGRATION.md', content: 'x' })
  // A commit of the entry points.
  await tool($, { tool: 'Edit', file_path: '/work/src/index.ts', old_string: 'a', new_string: 'b' })
  git.state.head = HEAD2
  await tool($, { tool: 'Bash', command: 'git commit -am "Wire the new token store"' })
  await w.clock.advance(2000)
  await steps($, w, 'a3', 3, { input_tokens: 1300, output_tokens: 500, cache_read_input_tokens: 47_000 }, 'claude-haiku-5-5')
  await tool($, { tool: 'Grep', pattern: 'refresh', path: 'src/auth', agentId: 'a3' } as never)
  // Just read: it shimmers.
  await tool($, { tool: 'Read', file_path: '/work/src/auth/session.ts', agentId: 'a3' })
  await w.clock.advance(1500)
}

const USAGE = (at: number) => ({
  startedAt: 0,
  context: { percent: 51, tokens: 102_000, window: 200_000 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 83, resetsAt: new Date(at + 72 * MIN).toISOString() },
    { kind: 'seven_day', percentUsed: 10, resetsAt: new Date(at + 4 * 24 * 60 * MIN + 5 * 60 * MIN).toISOString() },
  ],
})

async function measure($: Engine, w: ReturnType<typeof world>) {
  const u = USAGE(await w.clock.now())
  await $.session.measure({ context: u.context, rateLimits: u.rateLimits, changed: ['context'] } as never)
}

// A file row's place in the tree's rows, to click it where it sits.
const rowIndex = (drawn: unknown, client: string, id: string): number => {
  let at = -1
  JSON.stringify(drawn, (_k, v) => {
    if (v && typeof v === 'object' && v.key === client && Array.isArray(v.props?.rows)) at = v.props.rows.findIndex((r: { id: string }) => r.id === id)
    return v
  })
  return at
}

test('media: panel.svg, every section of a busy session', { options: { showTotals: true } }, async ($, on) => {
  const git = teamGit()
  const w = world(on, git.answer, TEAM_MODELS)
  await team($, w, git)
  await measure($, w)
  const ui = await mount($)
  emit('panel.svg', renderPane(await ui.drawn(), WIDTH))
})

test('media: usage.svg', { options: { ...ONLY, showUsage: true } }, async ($, on) => {
  const w = world(on)
  await start($)
  await measure($, w)
  const ui = await mount($)
  emit('usage.svg', await section(ui))
})

test('media: cost.svg', { options: { ...ONLY, showTotals: true } }, async ($, on) => {
  const git = teamGit()
  const w = world(on, git.answer, TEAM_MODELS)
  await team($, w, git)
  const ui = await mount($)
  emit('cost.svg', await section(ui))
})

test('media: agents.svg, the refactor open with its plan beneath', { options: { ...ONLY, showAgents: true } }, async ($, on) => {
  const git = teamGit()
  const w = world(on, git.answer, TEAM_MODELS)
  await team($, w, git)
  const ui = await mount($)
  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'rowhit-a4' })
  emit('agents.svg', await section(ui))
})

test('media: finished.svg, the Finished tab with its clear button', { options: { ...ONLY, showAgents: true } }, async ($, on) => {
  const git = teamGit()
  const w = world(on, git.answer, TEAM_MODELS)
  await team($, w, git)
  const ui = await mount($)
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: 'tabhit-done' })
  emit('finished.svg', await section(ui))
})

test('media: compact.svg', { options: { ...ONLY, showAgents: true } }, async ($, on) => {
  const w = world(on, undefined, ['claude-haiku-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'])
  await start($)
  const team = [
    { description: 'Map the auth module', type: 'Explore' },
    { description: 'Refactor the token store', type: 'general-purpose' },
    { description: 'Plan the session migration', type: 'Plan' },
    { description: 'Check the hooks API', type: 'claude-code-guide' },
    { description: 'review: error handling', type: 'general-purpose', workflow: 0 },
    { description: 'Write the changelog', type: 'docs-writer' },
    { description: 'Lint the sources', type: 'general-purpose', teammate: 'linter' },
  ]
  for (const s of team) await spawn($, s)
  for (let i = 1; i <= 7; i++) await steps($, w, `a${i}`, 2, { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 20_000 })
  await done($, 'a3')
  await done($, 'a4')
  await done($, 'a5', '', 'error')
  await done($, 'a6', '', 'aborted')
  await done($, 'a7')
  const ui = await mount($)
  await ui.press({ key: 'compact' })
  emit('compact.svg', await section(ui))
})

test('media: timeline.svg, two rounds with a pause folded between', { options: { ...ONLY, showTimeline: true } }, async ($, on) => {
  const w = world(on)
  await start($)
  const round = async (from: number, agents: [string, string, number, number][]) => {
    // [description, type, start, length] in seconds from the round's start;
    // the main chat's turn spans the round and a little more.
    const last = Math.max(...agents.map(([, , s, l]) => s + l))
    const events = [
      { at: 0, run: () => turnStart($, `m${from}`) },
      ...agents.flatMap(([d, t, s, l], i) => [
        { at: s, run: () => spawn($, { description: d, type: t }) },
        { at: s + l, run: () => done($, `a${from + i}`) },
      ]),
      { at: last + 25, run: () => turnEnd($, `m${from}`) },
    ]
    events.sort((a, b) => a.at - b.at)
    let now = 0
    for (const e of events) {
      await w.clock.advance((e.at - now) * 1000)
      now = e.at
      await e.run()
    }
  }
  await round(1, [
    ['Map the auth module', 'Explore', 0, 95],
    ['Plan the session migration', 'Plan', 30, 140],
    ['Refactor the token store', 'general-purpose', 120, 260],
    ['Check the hooks API', 'claude-code-guide', 150, 70],
  ])
  await w.clock.advance(80 * MIN)
  await round(5, [
    ['Write the migration guide', 'general-purpose', 0, 180],
    ['Review the token store', 'Explore', 40, 110],
  ])
  const ui = await mount($)
  emit('timeline.svg', await section(ui))
})

test('media: files.svg, a conflict open with its diff', { options: { ...ONLY, showFiles: true } }, async ($, on) => {
  const git = teamGit()
  const w = world(on, git.answer, TEAM_MODELS)
  await team($, w, git)
  const ui = await mount($)
  // Every folder open, then tokens.ts's card.
  if (JSON.stringify(await ui.drawn()).includes('"key":"files-fold-all","label":"⊞"')) await ui.press({ key: 'files-fold-all' })
  const at = rowIndex(await ui.drawn(), 'rows-a', '/work/src/auth/tokens.ts')
  expect(at).toBeGreaterThanOrEqual(0)
  await ui.pointer({ type: 'down', x: 4, y: at, button: 'left', in: 'rows-a' })
  await w.clock.advance(10)
  emit('files.svg', await section(ui))
})

test('media: settings.svg', async ($, on) => {
  world(on)
  await start($)
  const ui = await mount($, 'agent-crew-settings')
  // The first groups: the rest are more switches of the same kind.
  emit('settings.svg', renderPane(firstOf(await ui.drawn(), 3), WIDTH))
})

test('media: band.svg, the crew above the prompt', { options: { bandProgress: true, bandUsage: true } }, async ($, on) => {
  const git = teamGit()
  const w = world(on, git.answer, TEAM_MODELS)
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'engine', ref: 0 }) as never)
  await team($, w, git)
  await measure($, w)
  const band = await $.ui.mount({
    plugin: 'agent-crew',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: COLS, scroll: { offset: 0, bodyRows: 9 }, view: {} },
  } as never)
  // The prompt box beneath, so the band sits where it does.
  const prompt = { type: 'Box', props: { borderStyle: 'round', borderColor: '#6b6b68', paddingX: 1 }, children: [{ type: 'Text', props: { dimColor: true }, children: ['Reply to Claude…'] }] }
  const tree = { type: 'Box', props: { flexDirection: 'column', gap: 1 }, children: [await band.drawn(), prompt] }
  emit('band.svg', renderPane(tree, WIDTH))
})

// The banner: one crab per kind, walking, each in its type's colour.
test('media: crew.svg, every costume', async () => {
  const cast: [string, string, string, string][] = [
    ['pirate', '#1D9E75', 'Explore', ''],
    ['engineer', '#BA7517', 'Plan', ''],
    ['detective', '#378ADD', 'general-purpose', ''],
    ['astronaut', '#7F77DD', 'claude-code-guide', ''],
    ['chef', '#D85A30', 'workflow', 'agents'],
    ['racer', '#C2477E', 'teammate', ''],
    ['cap', '#6F8F2E', 'any other', 'type'],
  ]
  const W = WIDTH
  const H = 170
  const step = W / cast.length
  const scale = 2.6
  const body = cast
    .map(([costume, color, label, more], i) => {
      const cx = step * i + step / 2
      const x = cx - (30 * scale) / 2
      const name = `<text class="t" x="${cx}" y="128" text-anchor="middle" font-family="${xml(FONT)}" font-size="13" font-weight="600">${xml(label)}</text>`
      const sub = more ? `<text class="s" x="${cx}" y="146" text-anchor="middle" font-family="${xml(FONT)}" font-size="12">${xml(more)}</text>` : ''
      return crab(x, 22, costume, color, false, true, scale) + name + sub + `<rect x="${cx - 14}" y="${more ? 154 : 136}" width="28" height="3" rx="1.5" fill="${color}"/>`
    })
    .join('')
  emit('crew.svg', svg(W, H, body))
})
