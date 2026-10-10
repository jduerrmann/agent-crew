import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register } from 'claude-code'

import type { CrewUsage } from '../types'
import type { CrewFile, CrewGit, CrewGitFile, CrewKind, CrewLog, CrewPanel, CrewRun, CrewStatus, CrewTab } from '../types'
import { CLAY, FONT, crab, fitText, svg, textWidth, xml } from './crab'
import { applyNumstat, inside, keyOf, mayChange, parseStatus, posix, readTargets, resolve, treeRows } from './files'
import type { Tab, TabsProps } from './tabs'

// One pane for the session's crew and what it touched. Above: every subagent,
// however it started (the Agent tool, a fork, a teammate, a workflow script's
// agent(), one nested in another, one only `$.agent.list()` knows), in two tabs,
// each with a details view. Below: the files read, changed and committed, as a
// tree with git status, and which agents touched them.

const runs = atom({ plugin: 'agent-crew', key: 'runs' } as const, [])
const logs = atom({ plugin: 'agent-crew', key: 'logs' } as const, {})
const PANEL_DEFAULT: CrewPanel = {
  tab: 'active',
  expanded: [],
  isCompact: false,
  hasAutoOpened: false,
  fileFilter: 'all',
  isFilesCollapsed: false,
  isTimelineOpen: true,
}
const panel = atom({ plugin: 'agent-crew', key: 'panel' } as const, PANEL_DEFAULT)
const cleared = atom({ plugin: 'agent-crew', key: 'cleared' } as const, { cost: 0, tokens: 0 })
const files = atom({ plugin: 'agent-crew', key: 'files' } as const, [])
const git = atom({ plugin: 'agent-crew', key: 'git' } as const, null)
const now = atom({ plugin: 'agent-crew', key: 'now' } as const, 0)
const usage = atom({ plugin: 'agent-crew', key: 'usage' } as const, { context: { percent: null, window: 0 }, limits: [] })
const diff = atom({ plugin: 'agent-crew', key: 'diff' } as const, null)
const warned = atom({ plugin: 'agent-crew', key: 'warned' } as const, {})
const settingsRev = atom({ plugin: 'agent-crew', key: 'settingsRev' } as const, 0)
const mainCost = atom({ plugin: 'agent-crew', key: 'mainCost' } as const, { cost: 0, tokens: 0 })

// The plugin's options, set by register on every (re)load.
let opts: Record<string, unknown> = {}

const MAX_HISTORY = 12
const MAX_DIFF = 30_000
/** Two agents changing one file within this window is a conflict. */
const CONFLICT_MS = 10 * 60_000

const PANE = 'agent-crew'
const MAX_RUNS = 300
const MAX_FILES = 400
const MAX_LOG = 40
const MAX_TEXT = 4000
const FRESH_MS = 6000

const READ_COLOR = '#a855f7'
const WRITE_COLOR = '#f97316'
const COMMIT_COLOR = '#22c55e'

// ---------------------------------------------------------------------------
// Language: the `language` option, else Claude Code's `language` setting, else
// the process locale; English when nothing says German.

type Lang = 'de' | 'en'

const STRINGS = {
  de: {
    pane: 'Crew',
    cost: 'Kosten',
    tokens: 'Tokens',
    time: 'Zeit',
    collapse: 'Kompakt',
    expand: 'Ausklappen',
    active: 'Aktiv',
    finished: 'Fertig',
    clear: 'Fertige entfernen',
    noActive: 'Gerade läuft kein Subagent.',
    noDone: 'Noch kein Subagent fertig.',
    failed: 'Fehler',
    stopped: 'gestoppt',
    idle: 'wartet',
    background: 'Hintergrund',
    fork: 'Fork',
    teammate: 'Teammate',
    workflow: 'Workflow',
    tokensWord: 'Tokens',
    agentsCount: 'Agenten',
    isRunning: 'läuft',
    isFinished: 'fertig',
    opened: 'Crew-Panel geöffnet.',
    closed: 'Crew-Panel geschlossen.',
    details: 'Details',
    task: 'Auftrag',
    recent: 'Zuletzt',
    answer: 'Antwort',
    copy: 'Antwort kopieren',
    copied: 'Antwort kopiert.',
    nothingYet: 'Noch keine Aktion aufgezeichnet.',
    touched: (r: number, w: number) => `Dateien: ${r} gelesen, ${w} geändert`,
    files: 'Dateien',
    allFiles: 'Alle',
    changedOnly: 'Nur Änderungen',
    noFiles: 'Noch keine Dateien gelesen oder geändert.',
    legend: '◉ gelesen   ✎ geändert   ✓ committet',
    more: (n: number) => `… ${n} weitere`,
    main: 'Hauptchat',
    totalsTitle: 'Kosten',
    fresh: 'neu',
    cached: 'aus Cache',
    costNote: 'Tokens: neu = Eingabe, Ausgabe, Cache-Schreiben. Jede Anfrage liest den ganzen Kontext erneut, meist günstig aus dem Cache. Kosten sind geschätzt.',
    total: 'Gesamt',
    subagents: (n: number) => `Subagenten (${n})`,
    usage: 'Nutzung',
    context: 'Kontext',
    fiveHour: '5 Std.',
    week: 'Woche',
    resets: (span: string) => `zurück in ${span}`,
    conflict: (file: string, names: string[]) => `⚠ ${file}: kurz nacheinander geändert von ${names.join(' und ')}`,
    conflictLine: (names: string) => `⚠ Von mehreren Agenten geändert: ${names}`,
    agentDone: (name: string, time: string) => `✓ ${name} ist fertig (${time})`,
    agentFailed: (name: string) => `✗ ${name} ist fehlgeschlagen`,
    agentStopped: (name: string) => `■ ${name} wurde gestoppt`,
    limitWarn: (label: string, pct: number, reset: string) => `${label}-Limit bei ${pct} %${reset ? ` (${reset})` : ''}`,
    contextWarn: (pct: number) => `Kontext zu ${pct} % voll: /compact schafft Platz`,
    timeline: 'Zeitleiste',
    focusOn: 'Seine Dateien hervorheben',
    focusOff: 'Hervorhebung aufheben',
    history: 'Verlauf',
    histKind: { read: 'gelesen', write: 'geändert', commit: 'committet' },
    changes: 'Änderungen',
    newFile: 'Neue Datei',
    noDiff: 'Kein Unterschied zu HEAD.',
    isNew: 'neu',
    isDeleted: 'gelöscht',
    statusRunning: (n: number) => `${n} Subagent${n === 1 ? '' : 'en'} aktiv`,
  },
  en: {
    pane: 'Crew',
    cost: 'Cost',
    tokens: 'Tokens',
    time: 'Time',
    collapse: 'Compact',
    expand: 'Expand',
    active: 'Active',
    finished: 'Finished',
    clear: 'Clear finished',
    noActive: 'No subagent is running.',
    noDone: 'No subagent has finished yet.',
    failed: 'error',
    stopped: 'stopped',
    idle: 'waiting',
    background: 'background',
    fork: 'fork',
    teammate: 'teammate',
    workflow: 'workflow',
    tokensWord: 'tokens',
    agentsCount: 'agents',
    isRunning: 'running',
    isFinished: 'finished',
    opened: 'Crew panel opened.',
    closed: 'Crew panel closed.',
    details: 'Details',
    task: 'Task',
    recent: 'Recent',
    answer: 'Answer',
    copy: 'Copy answer',
    copied: 'Answer copied.',
    nothingYet: 'No action recorded yet.',
    touched: (r: number, w: number) => `Files: ${r} read, ${w} changed`,
    files: 'Files',
    allFiles: 'All',
    changedOnly: 'Changes only',
    noFiles: 'No files read or changed yet.',
    legend: '◉ read   ✎ changed   ✓ committed',
    more: (n: number) => `… ${n} more`,
    main: 'main chat',
    totalsTitle: 'Cost',
    fresh: 'new',
    cached: 'cached',
    costNote: 'Tokens: new = input, output, cache writes. Each request rereads the whole context, mostly cheaply from the cache. Cost is an estimate.',
    total: 'Total',
    subagents: (n: number) => `Subagents (${n})`,
    usage: 'Usage',
    context: 'context',
    fiveHour: '5h',
    week: 'week',
    resets: (span: string) => `resets in ${span}`,
    conflict: (file: string, names: string[]) => `⚠ ${file}: changed close together by ${names.join(' and ')}`,
    conflictLine: (names: string) => `⚠ Changed by several agents: ${names}`,
    agentDone: (name: string, time: string) => `✓ ${name} finished (${time})`,
    agentFailed: (name: string) => `✗ ${name} failed`,
    agentStopped: (name: string) => `■ ${name} was stopped`,
    limitWarn: (label: string, pct: number, reset: string) => `${label} limit at ${pct} %${reset ? ` (${reset})` : ''}`,
    contextWarn: (pct: number) => `Context ${pct} % full: /compact makes room`,
    timeline: 'Timeline',
    focusOn: 'Highlight its files',
    focusOff: 'Clear highlight',
    history: 'History',
    histKind: { read: 'read', write: 'changed', commit: 'committed' },
    changes: 'Changes',
    newFile: 'New file',
    noDiff: 'No difference to HEAD.',
    isNew: 'new',
    isDeleted: 'deleted',
    statusRunning: (n: number) => `${n} subagent${n === 1 ? '' : 's'} running`,
  },
} as const

// Module scope is fine for these: session.start sets them again on every (re)load.
let lang: Lang = 'en'
let fold = false
let home = ''
let gitQueued = false
let gitBusy = false
let tick = 0
const tr = () => STRINGS[lang]

const isGerman = (v: unknown): boolean => typeof v === 'string' && /^(de|german|deutsch)/i.test(v.trim())

async function detectLang($: EngineInterface, option: unknown): Promise<Lang> {
  if (option === 'de' || option === 'en') return option
  try {
    const settings = (await $.settings.read()) as Record<string, unknown>
    if (typeof settings.language === 'string' && settings.language.trim()) return isGerman(settings.language) ? 'de' : 'en'
  } catch {
    // No settings: fall through to the locale.
  }
  const locale = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
  if (locale) return isGerman(locale) ? 'de' : 'en'
  // Windows sets no LANG: the runtime's own locale follows the system's.
  try {
    return isGerman(new Intl.DateTimeFormat().resolvedOptions().locale) ? 'de' : 'en'
  } catch {
    return 'en'
  }
}

// State written by an older version of the mod lacks newer fields.
const readPanel = async ($: EngineInterface): Promise<CrewPanel> => ({ ...PANEL_DEFAULT, ...(await read($, panel)) })
const setPanel = ($: EngineInterface, fn: (p: CrewPanel) => Partial<CrewPanel>) =>
  update($, panel, prev => {
    const p = { ...PANEL_DEFAULT, ...prev }
    return { ...p, ...fn(p) }
  })

// ---------------------------------------------------------------------------
// Money, models, formatting.

// USD per million tokens: input, output, cache read, cache write (5-minute TTL).
// The engine reports tokens, not money, so the cost is an estimate.
const PRICES: [RegExp, [number, number, number, number]][] = [
  [/fable|mythos/, [10, 50, 0.25, 12.5]],
  [/opus-5-5/, [4, 20, 0.2, 5]],
  [/opus/, [5, 25, 0.5, 6.25]],
  [/sonnet/, [2, 10, 0.2, 2.5]],
  [/haiku/, [1, 5, 0.1, 1.25]],
]

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

const priceOf = (model: string): [number, number, number, number] =>
  PRICES.find(([re]) => re.test(model.toLowerCase()))?.[1] ?? [4, 20, 0.2, 5]

const costOf = (model: string, u: Usage): number => {
  const [i, o, r, w] = priceOf(model)
  return (
    ((u.input_tokens || 0) * i +
      (u.output_tokens || 0) * o +
      (u.cache_read_input_tokens || 0) * r +
      (u.cache_creation_input_tokens || 0) * w) /
    1e6
  )
}

/** Everything a request carried: the context window's fill after it. */
const sumOf = (u: Usage): number =>
  (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)

// Each request resends the whole context, mostly read from the cache. Counted
// apart: what was new (input, output, cache writes), and what the cache served.
const freshOf = (u: Usage): number => (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0)
const cacheOf = (u: Usage): number => u.cache_read_input_tokens || 0

const windowOf = (model: string): number => (/haiku/i.test(model) ? 200_000 : 1_000_000)

const modelName = (id: string): string => {
  const m = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(id)
  const [, family = '', major = '', minor] = m ?? []
  if (!family) return id.replace(/^claude-/, '').replace(/\[.*\]$/, '') || '—'
  return `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${major}${minor ? '.' + minor : ''}`
}

const fmtTokens = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`

const fmtCost = (usd: number): string => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`

const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const fmtAgo = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

const oneLine = (s: string, max: number): string => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

const isActive = (r: CrewRun): boolean => r.status === 'running' || r.status === 'idle'

const elapsed = (r: CrewRun, at: number): number => (r.endedAt ?? Math.max(at, r.startedAt)) - r.startedAt

const ctxOf = (r: CrewRun): number =>
  r.contextMax ? Math.min(100, Math.round((r.contextTokens / r.contextMax) * 100)) : 0

const totals = (list: CrewRun[], at: number, gone: { cost: number; tokens: number; cache?: number }) => {
  const cost = list.reduce((s, r) => s + r.costUsd, gone.cost)
  const tokens = list.reduce((s, r) => s + r.tokens, gone.tokens)
  const cache = list.reduce((s, r) => s + (r.cacheTokens ?? 0), gone.cache ?? 0)
  const start = Math.min(...list.map(r => r.startedAt))
  const end = Math.max(...list.map(r => r.endedAt ?? Math.max(at, r.startedAt)))
  return { cost, tokens, cache, time: list.length ? end - start : 0 }
}

// Over the cap, the oldest finished runs go first; an active one never does.
const trimRuns = (list: CrewRun[]): CrewRun[] => {
  let over = list.length - MAX_RUNS
  if (over <= 0) return list
  return list.filter(r => (over > 0 && !isActive(r) ? (over--, false) : true))
}

// ---------------------------------------------------------------------------
// Types, colours, costumes.

const SAVVY_COLOR: Record<string, string> = {
  fable: '#7F77DD',
  heavy: '#D85A30',
  careful: '#BA7517',
  medium: '#378ADD',
  light: '#1D9E75',
}

const PALETTE = ['#378ADD', '#1D9E75', '#D85A30', '#7F77DD', '#BA7517', '#C2477E', '#2E9AA8', '#6F8F2E']

// `savvy-careful`, or `savvy-flow:savvy-careful` when the agent ships in a plugin.
const bareType = (type: string): string => type.replace(/^[^:]*:/, '')

const savvyTier = (type: string): string | undefined => {
  const bare = bareType(type)
  const t = bare.replace(/^savvy-/, '').toLowerCase()
  return bare.startsWith('savvy-') && t in SAVVY_COLOR ? t : undefined
}

const hash = (s: string): number => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)

const colorOf = (r: Pick<CrewRun, 'type' | 'kind'>): string => {
  const tier = savvyTier(r.type)
  if (tier) return SAVVY_COLOR[tier] ?? '#888780'
  if (r.kind === 'fork') return '#888780'
  return PALETTE[hash(bareType(r.type)) % PALETTE.length] ?? '#888780'
}

const costumeOf = (r: Pick<CrewRun, 'type' | 'kind'>): string => {
  const tier = savvyTier(r.type)
  if (tier) return tier
  const bare = bareType(r.type).toLowerCase()
  if (bare === 'explore') return 'explore'
  if (bare === 'plan') return 'careful'
  if (bare === 'claude-code-guide') return 'fable'
  if (r.kind === 'workflow') return 'medium'
  if (r.kind === 'teammate') return 'light'
  return 'other'
}

const typeLabel = (r: CrewRun): string => (r.kind === 'fork' ? tr().fork : bareType(r.type) || '—')

const metaOf = (r: CrewRun, byId: Map<string, CrewRun>): string[] => {
  const s = tr()
  const meta = [r.effort ? `${modelName(r.model)} · ${r.effort}` : modelName(r.model)]
  if (r.name) meta.push(`@${r.name}`)
  if (r.kind === 'teammate') meta.push(s.teammate)
  if (r.kind === 'workflow') meta.push(`${s.workflow}${r.workflowIndex ? ' #' + r.workflowIndex : ''}`)
  else if (r.isBackground) meta.push(s.background)
  const parent = r.parentId ? byId.get(r.parentId) : undefined
  if (parent) meta.push(`↳ ${parent.description || typeLabel(parent)}`)
  if (r.status === 'idle') meta.push(s.idle)
  if (r.status === 'failed') meta.push(s.failed)
  if (r.status === 'stopped') meta.push(s.stopped)
  return meta
}

// Parents before their children, each level in start order; depth for the indent.
const ordered = (list: CrewRun[]): { run: CrewRun; depth: number }[] => {
  const ids = new Set(list.map(r => r.agentId).filter(Boolean))
  const children = new Map<string, CrewRun[]>()
  const roots: CrewRun[] = []
  for (const r of [...list].sort((a, b) => a.startedAt - b.startedAt)) {
    if (r.parentId && ids.has(r.parentId)) {
      const kids = children.get(r.parentId) ?? []
      kids.push(r)
      children.set(r.parentId, kids)
    } else roots.push(r)
  }
  const out: { run: CrewRun; depth: number }[] = []
  const walk = (r: CrewRun, depth: number) => {
    out.push({ run: r, depth })
    if (depth < 6 && r.agentId) for (const k of children.get(r.agentId) ?? []) walk(k, depth + 1)
  }
  roots.forEach(r => walk(r, 0))
  return out
}

// The active tab keeps a finished parent whose child still runs, as context.
const tabRuns = (list: CrewRun[], tab: CrewTab): CrewRun[] => {
  if (tab === 'done') return list.filter(r => !isActive(r))
  const byAgent = new Map(list.filter(r => r.agentId).map(r => [r.agentId ?? '', r]))
  const keep = new Set<string>()
  for (const r of list.filter(isActive)) {
    let cur: CrewRun | undefined = r
    for (let i = 0; cur && i < 8 && !keep.has(cur.id); i++) {
      keep.add(cur.id)
      cur = cur.parentId ? byAgent.get(cur.parentId) : undefined
    }
  }
  return list.filter(r => keep.has(r.id))
}

// ---------------------------------------------------------------------------
// Tool calls: one line for the log, and which files they read or wrote.

type Loose = Record<string, unknown>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const shortPath = (p: string, base: string): string => {
  const path = posix(p)
  if (base && inside(base, path, fold)) return path.slice(base.length).replace(/^\//, '') || path
  if (home && inside(home, path, fold)) return '~' + path.slice(home.length)
  return path
}

const summarize = (tool: string, input: Loose, base: string): string => {
  const file = str(input.file_path) || str(input.notebook_path)
  if (file) return shortPath(file, base)
  const command = str(input.command)
  if (command) return oneLine(command, 120)
  if (tool === 'Grep') return `"${oneLine(str(input.pattern), 60)}"${input.path ? ' in ' + shortPath(str(input.path), base) : ''}`
  if (tool === 'Glob') return oneLine(str(input.pattern), 80)
  if (tool === 'Agent') return oneLine(str(input.description), 80)
  if (tool === 'WebFetch') return oneLine(str(input.url), 100)
  if (tool === 'WebSearch') return oneLine(str(input.query), 100)
  const first = Object.values(input).find(v => typeof v === 'string' && v.trim())
  return typeof first === 'string' ? oneLine(first, 80) : ''
}

const toolName = (tool: string): string => tool.replace(/^mcp__([^_]+(?:_[^_]+)*)__/, (_, server: string) => `${server.slice(0, 12)}:`)

// ---------------------------------------------------------------------------
// Bookkeeping: runs.

const statusFromList = (s: AgentInfo['status']): CrewStatus => {
  if (s === 'completed') return 'done'
  if (s === 'failed') return 'failed'
  if (s === 'killed') return 'stopped'
  if (s === 'idle' || s === 'waiting') return 'idle'
  return 'running'
}

const isTerminal = (s: CrewStatus): boolean => s === 'done' || s === 'failed' || s === 'stopped'

async function refreshStatus($: EngineInterface): Promise<void> {
  const n = (await read($, runs)).filter(r => r.status === 'running').length
  $.ui.status(n ? `🦀 ${tr().statusRunning(n)}` : undefined)
}

// Folds `$.agent.list()` in: agents the mod never saw spawn (a forked skill, one
// started before the mod loaded) and states only the list knows (a kill, idling).
async function reconcile($: EngineInterface): Promise<void> {
  let list: AgentInfo[]
  try {
    list = await $.agent.list()
  } catch {
    return
  }
  if (!list.length) return
  const at = await $.clock.now()
  const next = [...(await read($, runs))]
  let changed = false
  for (const info of list) {
    const i = next.findIndex(r => r.agentId === info.id)
    const status = statusFromList(info.status)
    if (i < 0) {
      next.push({
        id: info.id,
        agentId: info.id,
        kind: info.teammateId ? 'teammate' : 'listed',
        type: info.type,
        description: info.description,
        name: info.name,
        model: '—',
        isBackground: false,
        parentId: info.parentId,
        status,
        startedAt: at,
        endedAt: isTerminal(status) ? at : undefined,
        contextTokens: 0,
        contextMax: 0,
        tokens: 0,
        costUsd: 0,
        steps: 0,
      })
      changed = true
      continue
    }
    const run = next[i]
    if (!run || run.status === status) continue
    // The list may lag a turn.complete: it never revives a finished run (a new
    // turn.step does that), but it does end or idle a running one.
    if (isTerminal(run.status) && !isTerminal(status)) continue
    next[i] = { ...run, status, endedAt: isTerminal(status) ? (run.endedAt ?? at) : undefined }
    changed = true
  }
  if (!changed) return
  await update($, runs, () => trimRuns(next))
  await refreshStatus($)
}

async function pushLog($: EngineInterface, agentId: string, entry: CrewLog): Promise<void> {
  await update($, logs, prev => {
    const all = { ...(prev ?? {}) }
    all[agentId] = [...(all[agentId] ?? []), entry].slice(-MAX_LOG)
    return all
  })
}

// ---------------------------------------------------------------------------
// Bookkeeping: files and git.

// A toast, or the system's notification when the option asks for it.
async function notify($: EngineInterface, text: string): Promise<void> {
  if (opts.notifyVia === 'system') {
    try {
      const sent = await $.ui.notify(text, { title: 'Crew' })
      if (sent.isSent) return
    } catch {
      // Fall back to a toast.
    }
  }
  $.ui.toast(text)
}

async function agentName($: EngineInterface, agent: string): Promise<string> {
  if (agent === 'main') return tr().main
  const r = (await read($, runs)).find(x => x.agentId === agent)
  return r ? r.description || typeLabel(r) : agent.slice(0, 8)
}

async function touch($: EngineInterface, paths: string[], kind: 'read' | 'write', agent: string): Promise<void> {
  if (!paths.length) return
  const at = await $.clock.now()
  const conflicts: { path: string; agents: string[] }[] = []
  await update($, files, prev => {
    const list = [...(prev ?? [])]
    for (const raw of paths) {
      const path = posix(raw)
      const key = keyOf(path, fold)
      const i = list.findIndex(f => f.key === key)
      const old: CrewFile = list[i] ?? { key, path, reads: 0, writes: 0, lastAt: at, lastKind: kind, agents: [] }
      const history = [...(old.history ?? []), { at, agent, kind }].slice(-MAX_HISTORY)
      // Several agents changing one file close together: flag it once.
      let conflict = old.conflict
      if (kind === 'write') {
        const writers = [...new Set(history.filter(h => h.kind === 'write' && at - h.at < CONFLICT_MS).map(h => h.agent))]
        if (writers.length > 1 && writers.some(w => !(old.conflict ?? []).includes(w))) {
          conflict = writers
          conflicts.push({ path, agents: writers })
        }
      }
      const f: CrewFile = {
        ...old,
        reads: old.reads + (kind === 'read' ? 1 : 0),
        writes: old.writes + (kind === 'write' ? 1 : 0),
        lastAt: at,
        lastKind: kind,
        agents: old.agents.includes(agent) ? old.agents : [...old.agents, agent],
        history,
        conflict,
      }
      if (i < 0) list.push(f)
      else list[i] = f
    }
    return list.length > MAX_FILES ? [...list].sort((a, b) => b.lastAt - a.lastAt).slice(0, MAX_FILES) : list
  })
  await update($, now, () => at)
  if (opts.warnConflicts !== false) {
    for (const c of conflicts) {
      const names = await Promise.all(c.agents.map(a => agentName($, a)))
      await notify($, tr().conflict(c.path.split('/').pop() ?? c.path, names))
    }
  }
}

// The open file's diff against HEAD, or its text when git does not track it yet.
async function loadDiff($: EngineInterface, key: string): Promise<void> {
  const g = await read($, git)
  const f = (await read($, files)).find(x => x.key === key)
  const gf = g?.files[key]
  const path = gf?.path ?? f?.path
  if (!path) return
  let text = ''
  let format: 'diff' | 'source' = 'diff'
  if (g && gf && !gf.code.includes('?')) {
    const rel = path.slice(g.root.length).replace(/^\//, '')
    text = (await runGit($, g.root, g.head ? ['diff', 'HEAD', '--no-color', '--', rel] : ['diff', '--no-color', '--', rel])) ?? ''
  } else if (gf?.code.includes('?')) {
    try {
      text = await $.fs.read(path)
      format = 'source'
    } catch {
      text = ''
    }
  }
  const next = text ? { key, text: text.slice(0, MAX_DIFF), format } : null
  await update($, diff, () => next)
}

const runGit = async ($: EngineInterface, cwd: string, args: string[]): Promise<string | null> => {
  try {
    const r = await $.process.run(['git', '--no-optional-locks', '-C', cwd, ...args], {
      timeoutMs: 8_000,
      env: { GIT_OPTIONAL_LOCKS: '0' },
    })
    return r.exitCode === 0 ? r.stdout : null
  } catch {
    return null
  }
}

// Status, line counts and new commits of the repository around the session's cwd.
async function syncGit($: EngineInterface): Promise<void> {
  if (gitBusy) {
    gitQueued = true
    return
  }
  gitBusy = true
  try {
    const cwd = posix(await $.session.cwd())
    // The way up from the cwd, not git's absolute top level: under a packaged
    // Windows app git sees through the folder redirection (AppData\Local\Packages\…)
    // while the tools keep the path the session gave, and the two must match.
    const up = await runGit($, cwd, ['rev-parse', '--show-cdup'])
    if (up === null) {
      if ((await read($, git)) !== null) await update($, git, () => null)
      return
    }
    const root = up.trim() ? resolve(cwd, up.trim(), home) : cwd
    const head = ((await runGit($, root, ['rev-parse', 'HEAD'])) ?? '').trim()
    const status = parseStatus((await runGit($, root, ['status', '--porcelain=v1', '-b', '-z', '--untracked-files=all'])) ?? '', root)
    const numstat = head
      ? await runGit($, root, ['diff', 'HEAD', '--numstat', '-z'])
      : await runGit($, root, ['diff', '--numstat', '-z'])
    applyNumstat(numstat ?? '', root, status.files)

    const byKey: CrewGit['files'] = {}
    for (const [path, f] of Object.entries(status.files)) byKey[keyOf(path, fold)] = f

    // Commits since the last look: their files turn green.
    const prev = await read($, git)
    if (prev && prev.root === root && prev.head && head && prev.head !== head) {
      const names = await runGit($, root, ['diff', '--name-only', '-z', prev.head, head])
      const committed = (names ?? '').split('\0').filter(Boolean).slice(0, 200).map(rel => `${root}/${rel}`)
      if (committed.length) {
        const at = await $.clock.now()
        const sha = head.slice(0, 7)
        await update($, files, list => {
          const out = [...(list ?? [])]
          for (const path of committed) {
            const key = keyOf(path, fold)
            const i = out.findIndex(f => f.key === key)
            const old: CrewFile = out[i] ?? { key, path, reads: 0, writes: 0, lastAt: at, lastKind: 'commit', agents: [] }
            const history = [...(old.history ?? []), { at, agent: 'git', kind: 'commit' as const }].slice(-MAX_HISTORY)
            const f: CrewFile = { ...old, lastAt: at, lastKind: 'commit', commit: sha, commitAt: at, history, conflict: undefined }
            if (i < 0) out.push(f)
            else out[i] = f
          }
          return out
        })
        await update($, now, () => at)
      }
    }
    const next: CrewGit = { root, head, ...status, files: byKey }
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      await update($, git, () => next)
      // The open file's diff follows the tree.
      const open = (await readPanel($)).openFile
      if (open) await loadDiff($, open)
    }
  } finally {
    gitBusy = false
    if (gitQueued) {
      gitQueued = false
      $.clock.after(300, () => void syncGit($).catch(() => undefined))
    }
  }
}

// Writes and commands settle a moment before git sees them.
const queueGit = ($: EngineInterface) => {
  $.clock.after(500, () => void syncGit($).catch(() => undefined))
}

async function record($: EngineInterface, tool: string, input: Loose, out: Loose | undefined, isOk: boolean, agentId: string | undefined): Promise<void> {
  const agent = agentId ?? 'main'
  const g = await read($, git)
  const base = g?.root ?? posix(await $.session.cwd())

  if (agentId && (await read($, runs)).some(r => r.agentId === agentId)) {
    const text = summarize(tool, input, base)
    const at = await $.clock.now()
    await pushLog($, agentId, { at, kind: 'tool', tool: toolName(tool), text, isError: !isOk || undefined })
    const line = `${toolName(tool)}${text ? ' ' + text : ''}`
    await update($, runs, list => list.map(r => (r.agentId === agentId ? { ...r, lastAction: oneLine(line, 140) } : r)))
  }
  if (!isOk) return

  const file = str(input.file_path) || str(input.notebook_path)
  if (tool === 'Read' && file) await touch($, [file], 'read', agent)
  else if ((tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') && file) {
    await touch($, [file], 'write', agent)
    queueGit($)
  } else if (tool === 'Grep' && out && Array.isArray(out.filenames)) {
    const cwd = posix(await $.session.cwd())
    await touch($, (out.filenames as unknown[]).filter(f => typeof f === 'string').slice(0, 20).map(f => resolve(cwd, f as string, home)), 'read', agent)
  } else if (tool === 'Bash' || tool === 'PowerShell') {
    const command = str(input.command)
    const cwd = posix(await $.session.cwd())
    await touch($, readTargets(command, cwd, str(out?.stdout), home), 'read', agent)
    if (mayChange(command)) queueGit($)
  }
}

// ---------------------------------------------------------------------------
// Pane helpers.

async function storeUsage(
  $: EngineInterface,
  context: { percent?: number; tokens?: number; window: number },
  limits: readonly { kind: string; percentUsed: number; resetsAt?: string }[],
): Promise<void> {
  const next: CrewUsage = {
    context: { percent: context.percent ?? null, tokens: context.tokens, window: context.window },
    limits: limits.map(l => ({ kind: l.kind, percent: l.percentUsed, resetsAt: l.resetsAt })),
  }
  if (JSON.stringify(await read($, usage)) !== JSON.stringify(next)) await update($, usage, () => next)
}

async function togglePane($: EngineInterface): Promise<boolean> {
  const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
  if (isOpen) {
    await $.ui.close({ id: PANE })
    return false
  }
  const at = await $.clock.now()
  await update($, now, () => at)
  await $.ui.open({ id: PANE, title: tr().pane })
  void syncGit($).catch(() => undefined)
  return true
}

const kindOf = (e: { fork: boolean; isTeammate?: true; workflow?: unknown }): CrewKind =>
  e.workflow ? 'workflow' : e.isTeammate ? 'teammate' : e.fork ? 'fork' : 'agent'

// --- desktop drawings.

const STATUS_GLYPH: Record<CrewStatus, string> = { running: '●', idle: '○', done: '✓', failed: '✗', stopped: '■' }

const statusMark = (x: number, y: number, status: CrewStatus, color: string): string => {
  if (status === 'running') return `<circle class="live" cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`
  if (status === 'idle') return `<circle cx="${x}" cy="${y}" r="3.5" fill="none" stroke="${color}" stroke-width="1.6"/>`
  if (status === 'done') return `<path d="M${x - 5} ${y}l3.5 3.5 6.5-7" fill="none" stroke="#3B9C5F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  if (status === 'stopped') return `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" rx="1.5" fill="#9a9a96"/>`
  return `<path d="M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8" stroke="#D0453F" stroke-width="1.8" stroke-linecap="round"/>`
}

// The cost section: the main chat and the subagents on rows of their own, a bar
// splitting the total between them, and the total underneath.
const COST_H = 92
const SUB_COLOR = '#378ADD'

type CostPart = { cost: number; tokens: number; cache: number }

const costSvg = (W: number, main: CostPart, subs: CostPart, agents: number): string => {
  const s = tr()
  const tokenText = (fresh: number, cache: number) => xml(`${fmtTokens(fresh)} ${s.fresh} · ${fmtTokens(cache)} ${s.cached}`)
  const total = main.cost + subs.cost
  const costX = W - 96
  const row = (y: number, color: string, label: string, p: CostPart) =>
    `<circle cx="5" cy="${y - 4}" r="4" fill="${color}"/>` +
    `<text class="t" x="16" y="${y}" font-family="${FONT}" font-size="12.5">${xml(label)}</text>` +
    `<text class="s" x="${costX}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">${tokenText(p.tokens, p.cache)}</text>` +
    `<text class="t" x="${W}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="12.5" font-weight="600" font-variant-numeric="tabular-nums">≈${fmtCost(p.cost)}</text>`
  const mainW = total > 0 ? Math.max(main.cost > 0 ? 3 : 0, Math.round((W * main.cost) / total)) : 0
  const bar =
    `<rect class="k" x="0" y="50" width="${W}" height="6" rx="3"/>` +
    (total > 0
      ? `<rect x="0" y="50" width="${mainW}" height="6" rx="3" fill="${CLAY}"/><rect x="${mainW}" y="50" width="${W - mainW}" height="6" rx="3" fill="${SUB_COLOR}"/>`
      : '')
  const sum =
    `<text class="s" x="0" y="80" font-family="${FONT}" font-size="12">${xml(s.total)}</text>` +
    `<text class="s" x="${costX}" y="80" text-anchor="end" font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">${tokenText(main.tokens + subs.tokens, main.cache + subs.cache)}</text>` +
    `<text class="t" x="${W}" y="80" text-anchor="end" font-family="${FONT}" font-size="15" font-weight="700" font-variant-numeric="tabular-nums">≈${fmtCost(total)}</text>`
  return svg(W, COST_H, row(14, CLAY, s.main, main) + row(36, SUB_COLOR, s.subagents(agents), subs) + bar + sum, false)
}

const ROW_H = 76
const INDENT = 16

const runSvg = (W: number, r: CrewRun, depth: number, byId: Map<string, CrewRun>, at: number, isViewed: boolean): string => {
  const color = colorOf(r)
  const ctx = ctxOf(r)
  const x0 = depth * INDENT
  const tx = x0 + 42
  const textW = W - tx - 22
  const stats = `ctx ${ctx}% · ${fmtTokens(r.contextTokens)}  ≈${fmtCost(r.costUsd)}  ${fmtTime(elapsed(r, at))}`
  const fill = r.status === 'done' ? 1 : ctx / 100
  const tree = depth ? `<path class="tree" d="M${x0 - INDENT / 2} 0V${ROW_H / 2 - 4}h${INDENT / 2 - 2}" fill="none" stroke-width="1.2"/>` : ''
  const last = r.lastAction ? `› ${r.lastAction}` : ''
  return svg(
    W,
    ROW_H,
    `${isViewed ? `<rect x="0" y="2" width="3" height="${ROW_H - 6}" rx="1.5" fill="${color}"/>` : ''}${tree}
${crab(x0 + (isViewed ? 4 : 0), 14, costumeOf(r), color, r.status === 'stopped', r.status === 'running')}
<text class="t" x="${tx}" y="18" font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(r.description || typeLabel(r), 13, textW))}</text>
<text x="${tx}" y="34" font-family="${FONT}" font-size="11"><tspan fill="${color}">${xml(fitText(typeLabel(r), 11, textW * 0.4))}</tspan><tspan class="s">  ${xml(fitText(metaOf(r, byId).join('  ·  '), 11, textW * 0.6))}</tspan></text>
<text class="m" x="${tx}" y="50" font-family="${FONT}" font-size="11">${xml(fitText(last, 11, textW))}</text>
<text class="s" x="${tx + textW}" y="64" text-anchor="end" font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${stats}</text>
<rect class="k" x="${tx}" y="68" width="${textW}" height="4" rx="2"/><rect x="${tx}" y="68" width="${Math.round(textW * fill)}" height="4" rx="2" fill="${color}" opacity="${r.status === 'done' ? 1 : 0.7}"/>
${statusMark(W - 8, 16, r.status, color)}`,
  )
}

const COMPACT_ROW = 36
const COMPACT_LABEL = 92

// Compact: one labelled row of crabs for the active, one for the finished. The
// active walk, with a live dot; the finished stand dimmed, a status badge on each.
const compactSvg = (W: number, active: CrewRun[], done: CrewRun[], t: ReturnType<typeof totals> | null): { source: string; height: number } => {
  const s = tr()
  const totalsW = t ? 150 : 0
  const fit = Math.max(1, Math.floor((W - COMPACT_LABEL - totalsW - 24) / 36))
  const rowOf = (runs: CrewRun[], y: number, isDone: boolean): string => {
    const shown = runs.slice(0, fit)
    const more = runs.length - shown.length
    if (!shown.length) return `<text class="m" x="${COMPACT_LABEL}" y="${y + 21}" font-family="${FONT}" font-size="12">—</text>`
    const crabs = shown
      .map((r, i) => {
        const x = COMPACT_LABEL + i * 36
        const badge = !isDone
          ? r.status === 'running'
            ? `<circle class="live" cx="${x + 32}" cy="${y + 4}" r="3" fill="${colorOf(r)}"/>`
            : `<circle cx="${x + 32}" cy="${y + 4}" r="3" fill="none" stroke="${colorOf(r)}" stroke-width="1.4"/>`
          : r.status === 'done'
            ? `<circle cx="${x + 31}" cy="${y + 5}" r="5" fill="#3B9C5F"/><path d="M${x + 28.5} ${y + 5}l1.8 1.8 3.2-3.4" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`
            : r.status === 'failed'
              ? `<circle cx="${x + 31}" cy="${y + 5}" r="5" fill="#D0453F"/><path d="M${x + 29} ${y + 3}l4 4M${x + 33} ${y + 3}l-4 4" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>`
              : `<circle cx="${x + 31}" cy="${y + 5}" r="5" fill="#9a9a96"/><rect x="${x + 29.2}" y="${y + 3.2}" width="3.6" height="3.6" fill="#fff"/>`
        return crab(x, y, costumeOf(r), colorOf(r), isDone, r.status === 'running') + badge
      })
      .join('')
    const moreX = COMPACT_LABEL + shown.length * 36 + 4
    return crabs + (more ? `<text class="s" x="${moreX}" y="${y + 21}" font-family="${FONT}" font-size="12">+${more}</text>` : '')
  }
  const label = (y: number, text: string, n: number, color: string) =>
    `<circle cx="5" cy="${y + 17}" r="4" fill="${color}"/>` +
    `<text x="15" y="${y + 21}" font-family="${FONT}" font-size="12"><tspan class="t" font-weight="600">${xml(text)}</tspan><tspan class="s"> ${n}</tspan></text>`
  const y2 = COMPACT_ROW + 6
  const height = y2 + COMPACT_ROW
  return {
    source: svg(
      W,
      height,
      label(0, s.active, active.length, CLAY) +
        rowOf(active, 0, false) +
        `<line class="ln" x1="0" y1="${COMPACT_ROW + 3}" x2="${W}" y2="${COMPACT_ROW + 3}"/>` +
        label(y2, s.finished, done.length, COMMIT_COLOR) +
        rowOf(done, y2, true) +
        (t
          ? `<text class="s" x="${W}" y="21" text-anchor="end" font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">≈${fmtCost(t.cost)} · ${fmtTokens(t.tokens)} · ${fmtTime(t.time)}</text>`
          : ''),
    ),
    height,
  }
}

// --- the timeline: when each subagent ran, on one shared time axis.

const TIMELINE_MAX = 14
const TL_ROW = 15

const timelineRuns = (list: CrewRun[]): CrewRun[] => [...list].sort((a, b) => a.startedAt - b.startedAt).slice(-TIMELINE_MAX)

/** A pause longer than this, with no agent running, folds into a break on the axis. */
const TL_GAP_MS = 90_000

// The axis of the timeline: stretches where agents ran, with each longer pause
// folded into a fixed-width break, so two rounds an hour apart both get bars.
const timelineAxis = (items: CrewRun[], at: number, width: number, gapW: number) => {
  const spans = items.map(r => [r.startedAt, r.endedAt ?? at] as const).sort((a, b) => a[0] - b[0])
  const clusters: { from: number; to: number }[] = []
  for (const [s0, s1] of spans) {
    const last = clusters.at(-1)
    if (last && s0 <= last.to + TL_GAP_MS) last.to = Math.max(last.to, s1)
    else clusters.push({ from: s0, to: s1 })
  }
  const busy = Math.max(1000, clusters.reduce((sum, c) => sum + (c.to - c.from), 0))
  const scale = Math.max(0.0001, (width - gapW * (clusters.length - 1)) / busy)
  const starts: number[] = []
  let x = 0
  for (const c of clusters) {
    starts.push(x)
    x += (c.to - c.from) * scale + gapW
  }
  const xOf = (t: number): number => {
    const i = Math.max(0, clusters.findIndex(c => t <= c.to))
    const c = clusters[i] ?? clusters[clusters.length - 1]
    if (!c) return 0
    return (starts[i] ?? 0) + (Math.min(Math.max(t, c.from), c.to) - c.from) * scale
  }
  // Each break: where it sits, and how long the pause was.
  const breaks = clusters.slice(1).map((c, i) => ({ x: (starts[i + 1] ?? 0) - gapW, pause: c.from - (clusters[i]?.to ?? c.from) }))
  return { xOf, breaks, total: (clusters.at(-1)?.to ?? at) - (clusters[0]?.from ?? at) }
}

const timelineSvg = (W: number, list: CrewRun[], at: number): { source: string; height: number } => {
  const items = timelineRuns(list)
  const labelW = Math.min(170, Math.round(W * 0.32))
  const barX = labelW + 8
  const barW = W - barX - 4
  const GAP_W = 22
  const axis = timelineAxis(items, at, barW, GAP_W)
  const rows = items
    .map((r, i) => {
      const y = i * TL_ROW
      const x = barX + axis.xOf(r.startedAt)
      const w = Math.max(3, axis.xOf(r.endedAt ?? at) - axis.xOf(r.startedAt))
      const color = r.status === 'failed' ? '#D0453F' : colorOf(r)
      return (
        `<text class="s" x="0" y="${y + 11}" font-family="${FONT}" font-size="11">${xml(fitText(r.description || typeLabel(r), 11, labelW))}</text>` +
        `<rect class="k" x="${barX}" y="${y + 4}" width="${barW}" height="7" rx="3.5"/>` +
        `<rect${r.status === 'running' ? ' class="live"' : ''} x="${x}" y="${y + 4}" width="${w}" height="7" rx="3.5" fill="${color}" opacity="${r.status === 'stopped' ? 0.45 : 0.9}"/>`
      )
    })
    .join('')
  const axisY = items.length * TL_ROW + 12
  // A break: two slanted strokes across the rows, the pause written under them.
  const breaks = axis.breaks
    .map(b => {
      const cx = barX + b.x + GAP_W / 2
      return (
        `<path class="tree" d="M${cx - 4} ${items.length * TL_ROW + 2}L${cx - 1} 0M${cx + 1} ${items.length * TL_ROW + 2}L${cx + 4} 0" fill="none" stroke-width="1.2"/>` +
        `<text class="m" x="${cx}" y="${axisY}" text-anchor="middle" font-family="${FONT}" font-size="9.5">+${fmtTime(b.pause)}</text>`
      )
    })
    .join('')
  const ends =
    `<text class="m" x="${barX}" y="${axisY}" font-family="${FONT}" font-size="10">0:00</text>` +
    `<text class="m" x="${barX + barW}" y="${axisY}" text-anchor="end" font-family="${FONT}" font-size="10">${fmtTime(axis.total)}</text>`
  const height = axisY + 4
  return { source: svg(W, height, rows + breaks + ends, false), height }
}

// --- frames: each section of the pane sits in a rounded box of its own.

const FRAME = { flexDirection: 'column', borderStyle: 'round', borderColor: '#6b6b68', borderDimColor: true, paddingX: 1 } as const
/** Columns a frame takes off the width: two borders, two cells of padding. */
const FRAME_COLS = 4

/** An expanded row's card: framed in its colour, indented by its depth. */
const card = (color: string, depth: number) =>
  ({
    flexDirection: 'column',
    borderStyle: 'round',
    borderColor: color,
    paddingX: 1,
    marginLeft: depth * 2,
    marginY: 0,
  }) as const

/** An expanded agent's card, in the agent's colour. */
const cardOf = (r: Pick<CrewRun, 'type' | 'kind'>, depth: number) => card(colorOf(r), depth)

// --- the usage section: the context window and the plan's rate-limit windows.

type Meter = { key: string; label: string; percent: number; detail?: string; resetsAt?: string }

const metersOf = (u: CrewUsage): Meter[] => {
  const s = tr()
  const out: Meter[] = []
  if (u.context.percent !== null) {
    const detail = u.context.tokens ? `${fmtTokens(u.context.tokens)} / ${fmtTokens(u.context.window)}` : undefined
    out.push({ key: 'context', label: s.context, percent: u.context.percent, detail })
  }
  for (const l of u.limits) {
    const kind = l.kind.toLowerCase()
    const label = /five|5h/.test(kind) ? s.fiveHour : /seven|7d|week/.test(kind) ? s.week : kind.replace(/_/g, ' ')
    out.push({ key: l.kind, label, percent: l.percent, resetsAt: l.resetsAt })
  }
  return out.map(m => ({ ...m, percent: Math.max(0, Math.min(100, Math.round(m.percent))) }))
}

// Blue while there is room, amber from 80 %, red from 95 %.
const meterColor = (percent: number): string => (percent >= 95 ? '#D0453F' : percent >= 80 ? '#BA7517' : '#378ADD')

const resetIn = (iso: string, at: number): string => {
  const when = Date.parse(iso)
  if (!Number.isFinite(when)) return ''
  const ms = when - at
  if (ms <= 0) return ''
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const span = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m}m` : `${m}m`
  return tr().resets(span)
}

const USAGE_H = 44
const RING_R = 9

const usageSvg = (W: number, meters: Meter[], at: number): string => {
  const itemW = W / Math.max(1, meters.length)
  const c = 2 * Math.PI * RING_R
  const items = meters
    .map((m, i) => {
      const x = i * itemW + RING_R + 3
      const filled = (c * m.percent) / 100
      const sub = [m.detail, m.resetsAt ? resetIn(m.resetsAt, at) : ''].filter(Boolean).join(' · ')
      const textW = itemW - RING_R * 2 - 16
      return (
        `<circle cx="${x}" cy="16" r="${RING_R}" fill="none" stroke="#9a9a96" stroke-opacity=".3" stroke-width="3"/>` +
        `<circle cx="${x}" cy="16" r="${RING_R}" fill="none" stroke="${meterColor(m.percent)}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${filled} ${c}" transform="rotate(-90 ${x} 16)"/>` +
        `<text x="${x + RING_R + 8}" y="20" font-family="${FONT}" font-size="12.5"><tspan class="t" font-weight="600">${m.percent}%</tspan><tspan class="s"> ${xml(m.label)}</tspan></text>` +
        (sub ? `<text class="m" x="${x + RING_R + 8}" y="36" font-family="${FONT}" font-size="10.5">${xml(fitText(sub, 10.5, textW))}</text>` : '')
      )
    })
    .join('')
  return svg(W, USAGE_H, items, false)
}

// --- the files section.

type FileView = {
  key: string
  label: string
  file?: CrewFile
  gitFile?: CrewGitFile
}

const isChanged = (v: FileView): boolean => Boolean(v.gitFile || (v.file && (v.file.writes > 0 || v.file.commit)))

const fileColor = (v: FileView): string => {
  if (v.gitFile || v.file?.lastKind === 'write') return WRITE_COLOR
  if (v.file?.commit) return COMMIT_COLOR
  return READ_COLOR
}

const fileGlyph = (v: FileView): string => {
  if (v.gitFile?.code.includes('?')) return '+'
  if (v.gitFile?.code.includes('D')) return '−'
  if (v.gitFile || v.file?.lastKind === 'write') return '✎'
  if (v.file?.commit) return '✓'
  return '◉'
}

const gitBadge = (v: FileView): string => {
  const g = v.gitFile
  if (!g) return v.file?.commit ? `✓ ${v.file.commit}` : ''
  if (g.code.includes('?')) return tr().isNew
  if (g.code.includes('D')) return tr().isDeleted
  return g.add || g.del ? `+${g.add} −${g.del}` : g.code.trim()
}

const fileViews = (list: CrewFile[], g: CrewGit | null, base: string, filter: 'all' | 'changed'): FileView[] => {
  const map = new Map<string, FileView>()
  const label = (path: string) => shortPath(path, base)
  for (const f of list) map.set(f.key, { key: f.key, label: label(f.path), file: f })
  if (g) {
    for (const [key, gf] of Object.entries(g.files)) {
      const v = map.get(key)
      if (v) v.gitFile = gf
      else map.set(key, { key, label: label(gf.path), gitFile: gf })
    }
  }
  const out = [...map.values()]
  return filter === 'changed' ? out.filter(isChanged) : out
}

const MAX_FILE_ROWS = 80
const FILE_ROW_H = 20

const dirRowSvg = (W: number, name: string, depth: number): string =>
  svg(W, FILE_ROW_H, `<text class="s" x="${depth * 14}" y="14" font-family="${FONT}" font-size="12">▾ ${xml(fitText(name + '/', 12, W - depth * 14 - 20))}</text>`, false)

// One file: its glyph and name in the colour of what last happened to it (a fresh
// one pulses), the dots of the agents that touched it, its git badge at the right.
const fileRowSvg = (
  W: number,
  name: string,
  depth: number,
  v: FileView,
  byAgent: Map<string, CrewRun>,
  flags: { isFresh: boolean; isOpen: boolean; isDim: boolean; hasConflict: boolean },
): string => {
  const x = depth * 14
  const y = 14
  const color = fileColor(v)
  const badge = gitBadge(v)
  const agents = v.file?.agents.slice(0, 6) ?? []
  const warnW = flags.hasConflict ? 16 : 0
  const badgeW = badge ? textWidth(badge, 11) + 10 : 0
  const dotsW = agents.length * 9
  const nameW = W - x - 18 - badgeW - dotsW - warnW - 6
  const dots = agents
    .map((a, j) => `<circle cx="${W - warnW - badgeW - dotsW + j * 9 + 4}" cy="${y - 4}" r="3.2" fill="${agentColor(a, byAgent)}"/>`)
    .join('')
  const fresh = flags.isFresh ? ' class="fresh"' : ''
  return svg(
    W,
    FILE_ROW_H,
    `<g opacity="${flags.isDim ? 0.35 : 1}">` +
      (flags.isOpen ? `<rect class="k" x="${Math.max(0, x - 4)}" y="1" width="${W - Math.max(0, x - 4)}" height="${FILE_ROW_H - 2}" rx="5"/>` : '') +
      `<text x="${x}" y="${y}" font-family="${FONT}" font-size="12" fill="${color}"${fresh}>${fileGlyph(v)}</text>` +
      `<text class="t" x="${x + 16}" y="${y}" font-family="${FONT}" font-size="12"${flags.isFresh ? ` fill="${color}" font-weight="600"` : flags.isOpen ? ' font-weight="600"' : ''}>${xml(fitText(name, 12, nameW))}</text>` +
      dots +
      (badge
        ? `<text x="${W - warnW}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums" fill="${v.gitFile ? WRITE_COLOR : COMMIT_COLOR}">${xml(badge)}</text>`
        : '') +
      (flags.hasConflict ? `<text class="live" x="${W}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="12" fill="#D0453F">⚠</text>` : '') +
      `</g>`,
    false,
  )
}

const agentColor = (id: string, byAgent: Map<string, CrewRun>): string => {
  if (id === 'main') return CLAY
  const r = byAgent.get(id)
  return r ? colorOf(r) : '#9a9a96'
}


// ---------------------------------------------------------------------------

// A finished subagent, by the `notifyAgents` option: `off`, `failures`,
// `background` (background agents, and any failure; the default) or `all`.
async function announceEnd($: EngineInterface, r: CrewRun): Promise<void> {
  const mode = typeof opts.notifyAgents === 'string' ? opts.notifyAgents : 'background'
  if (mode === 'off' || r.status === 'idle' || r.status === 'running') return
  const isProblem = r.status === 'failed' || r.status === 'stopped'
  if (!isProblem && mode === 'failures') return
  if (!isProblem && mode === 'background' && !r.isBackground && r.kind !== 'workflow') return
  const s = tr()
  const name = r.description || typeLabel(r)
  const at = await $.clock.now()
  await notify($, r.status === 'done' ? s.agentDone(name, fmtTime(elapsed(r, at))) : r.status === 'failed' ? s.agentFailed(name) : s.agentStopped(name))
}

// Warns once as a meter passes 80 % and again at 95 %; context from 85 %.
async function warnLimits($: EngineInterface): Promise<void> {
  const s = tr()
  const u = await read($, usage)
  const before = { ...(await read($, warned)) }
  const after = { ...before }
  const at = await $.clock.now()
  const say: string[] = []
  for (const m of metersOf(u)) {
    const isContext = m.key === 'context'
    const level = isContext ? (m.percent >= 85 ? 85 : 0) : m.percent >= 95 ? 95 : m.percent >= 80 ? 80 : 0
    if (level > (before[m.key] ?? 0)) say.push(isContext ? s.contextWarn(m.percent) : s.limitWarn(m.label, m.percent, m.resetsAt ? resetIn(m.resetsAt, at) : ''))
    after[m.key] = level
  }
  if (JSON.stringify(before) !== JSON.stringify(after)) await update($, warned, () => after)
  for (const text of say) await notify($, text)
}

// ---------------------------------------------------------------------------
// Settings: the plugin's own `/config` rows in a pane of their own. Values are
// written with `$.config.set`, so the pane and `/config` always agree.

const PLUGIN = 'agent-crew'
const SETTINGS = 'agent-crew-settings'

type Field = { key: string; group: 'view' | 'notify'; default: boolean | string; choices?: readonly string[] }

const FIELDS: readonly Field[] = [
  { key: 'showUsage', group: 'view', default: true },
  { key: 'showTimeline', group: 'view', default: true },
  { key: 'showTotals', group: 'view', default: false },
  { key: 'autoOpen', group: 'view', default: true },
  { key: 'language', group: 'view', default: 'auto', choices: ['auto', 'de', 'en'] },
  { key: 'notifyAgents', group: 'notify', default: 'background', choices: ['off', 'failures', 'background', 'all'] },
  { key: 'notifyVia', group: 'notify', default: 'toast', choices: ['toast', 'system'] },
  { key: 'limitWarnings', group: 'notify', default: true },
  { key: 'warnConflicts', group: 'notify', default: true },
]

const FIELD_TEXT = {
  de: {
    title: 'Crew · Einstellungen',
    view: 'Anzeige',
    notify: 'Benachrichtigungen',
    on: 'An',
    off: 'Aus',
    locked: 'Vom Administrator festgelegt',
    footer: 'Dieselben Werte wie in /config. Änderungen gelten sofort.',
    opened: 'Crew-Einstellungen geöffnet.',
    open: 'Einstellungen',
    fields: {
      showUsage: ['Nutzung', 'Kontext, 5-Stunden- und Wochenlimit oben im Panel'],
      showTimeline: ['Zeitleiste', 'Wann welcher Agent lief, auf einer gemeinsamen Achse'],
      showTotals: ['Kosten', 'Hauptchat und Subagenten getrennt, mit Tokens und Gesamtsumme'],
      autoOpen: ['Automatisch öffnen', 'Das Panel öffnet sich beim ersten Subagenten einer Session'],
      language: ['Sprache', 'Automatisch folgt der Sprache von Claude Code, dann dem System'],
      notifyAgents: ['Agent fertig', 'Wann eine Meldung kommt, wenn ein Subagent endet'],
      notifyVia: ['Meldungen als', 'In Claude Code oder als Benachrichtigung von Terminal bzw. System'],
      limitWarnings: ['Limit-Warnungen', 'Bei 80 % und 95 % eines Limits, und bei 85 % Kontext'],
      warnConflicts: ['Konflikt-Warnung', 'Wenn zwei Agenten innerhalb von 10 Minuten dieselbe Datei ändern'],
    } as Record<string, [string, string]>,
    choices: {
      auto: 'Automatisch', de: 'Deutsch', en: 'English',
      off: 'Aus', failures: 'Nur Fehler', background: 'Hintergrund', all: 'Alle',
      toast: 'In Claude Code', system: 'System',
    } as Record<string, string>,
  },
  en: {
    title: 'Crew · Settings',
    view: 'Display',
    notify: 'Notifications',
    on: 'On',
    off: 'Off',
    locked: 'Set by your administrator',
    footer: 'The same values as /config. Changes apply at once.',
    opened: 'Crew settings opened.',
    open: 'Settings',
    fields: {
      showUsage: ['Usage', 'Context, 5-hour and weekly limit at the top of the panel'],
      showTimeline: ['Timeline', 'When each agent ran, on one shared axis'],
      showTotals: ['Cost', 'Main chat and subagents apart, with tokens and a total'],
      autoOpen: ['Open automatically', 'The panel opens on the first subagent of a session'],
      language: ['Language', 'Automatic follows Claude Code’s language, then the system'],
      notifyAgents: ['Agent finished', 'When a notice comes as a subagent ends'],
      notifyVia: ['Notices as', 'Inside Claude Code, or as the terminal’s or system’s notification'],
      limitWarnings: ['Limit warnings', 'At 80 % and 95 % of a limit, and at 85 % context'],
      warnConflicts: ['Conflict warning', 'When two agents change the same file within 10 minutes'],
    } as Record<string, [string, string]>,
    choices: {
      auto: 'Automatic', de: 'Deutsch', en: 'English',
      off: 'Off', failures: 'Failures only', background: 'Background', all: 'All',
      toast: 'In Claude Code', system: 'System',
    } as Record<string, string>,
  },
} as const

const ft = () => FIELD_TEXT[lang]

async function openSettings($: EngineInterface): Promise<void> {
  await $.ui.open({ id: SETTINGS, title: ft().title })
}

// Writes one option the way /config would, then takes it at once.
async function setOption($: EngineInterface, key: string, value: boolean | string): Promise<void> {
  try {
    const r = await $.config.set({ key: `${PLUGIN}.${key}`, value })
    if (r.deny !== undefined) {
      $.ui.toast(r.deny)
      return
    }
  } catch (err) {
    $.ui.toast(err instanceof Error ? err.message : String(err))
    return
  }
  opts = { ...opts, [key]: value }
  if (key === 'language') {
    lang = await detectLang($, value)
    void $.ui.open({ id: SETTINGS, title: ft().title }).catch(() => undefined)
    if ((await $.ui.panes()).some(p => p.id === PANE)) void $.ui.open({ id: PANE, title: tr().pane }).catch(() => undefined)
  }
  await update($, settingsRev, n => (n ?? 0) + 1)
}

export const register: Register = (on, options) => {
  opts = options
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await detectLang($, opts.language)
    fold = (await $.env.get('OS')) === 'Windows_NT'
    home = posix(((await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || '').replace(/[\\/]+$/, ''))
    await $.command.register({
      name: 'crew',
      description: 'Show or hide the crew panel: every subagent of this session, and the files read, changed and committed',
    })
    await $.command.register({
      name: 'crew-settings',
      description: 'Open the crew panel settings: usage, timeline, totals, notifications, language',
    })

    // Each second: clocks of running rows and the fade of fresh files. Every few
    // seconds while something is active: the engine's agent list. While the pane
    // is open, git every ten seconds, so commits made outside show up too.
    $.clock.every(1000, () => {
      void (async () => {
        tick++
        const list = await read($, runs)
        const at = await $.clock.now()
        const fresh = (await read($, files)).some(f => at - f.lastAt < FRESH_MS + 1000)
        if (list.some(r => r.status === 'running') || fresh) await update($, now, () => at)
        if (list.some(isActive) && tick % 3 === 0) await reconcile($)
        if (tick % 10 === 0 && (await $.ui.panes()).some(p => p.id === PANE)) await syncGit($)
      })().catch(() => undefined)
    })
    await reconcile($)
    await refreshStatus($)
    void syncGit($).catch(() => undefined)
    try {
      const u = await $.session.usage()
      await storeUsage($, u.context, u.rateLimits)
    } catch {
      // No figures yet: the first session.measure brings them.
    }
    // A pane left open by an earlier load keeps its old title until opened again.
    if ((await $.ui.panes()).some(p => p.id === PANE)) void $.ui.open({ id: PANE, title: tr().pane }).catch(() => undefined)
    return started
  })

  on('command.run', { command: 'crew' }, async $ => {
    await reconcile($)
    const isOpen = await togglePane($)
    return { text: isOpen ? tr().opened : tr().closed }
  })

  on('command.run', { command: 'crew-settings' }, async $ => {
    await openSettings($)
    return { text: ft().opened }
  })

  // The settings pane: one framed group for display, one for notifications.
  on('ui.render', { component: 'Pane', requestId: SETTINGS }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    await read($, settingsRev)
    const f = ft()
    let rows: Awaited<ReturnType<EngineInterface['config']['list']>> = []
    try {
      rows = await $.config.list()
    } catch {
      // No rows (an older host): the values the module holds stand.
    }
    const rowOf = (field: Field) => rows.find(r => r.key === `${PLUGIN}.${field.key}`)
    const valueOf = (field: Field): boolean | string => {
      const v = rowOf(field)?.value ?? opts[field.key]
      return typeof v === 'boolean' || typeof v === 'string' ? v : field.default
    }

    const control = (field: Field) => {
      const value = valueOf(field)
      if (rowOf(field)?.isLocked) return <Text dimColor>🔒 {f.locked}</Text>
      if (!field.choices) {
        const isOn = value === true
        return (
          <Button
            key={`set-${field.key}`}
            label={isOn ? `● ${f.on}` : `○ ${f.off}`}
            variant={isOn ? 'primary' : 'secondary'}
            onPress={() => setOption($, field.key, !isOn)}
          />
        )
      }
      return (
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {field.choices.map(c => (
            <Button
              key={`set-${field.key}-${c}`}
              label={`${value === c ? '✓ ' : ''}${f.choices[c] ?? c}`}
              variant={value === c ? 'primary' : 'secondary'}
              onPress={() => (value === c ? undefined : setOption($, field.key, c))}
            />
          ))}
        </Box>
      )
    }

    const fieldRow = (field: Field) => {
      const [label, help] = f.fields[field.key] ?? [field.key, '']
      return field.choices ? (
        <Box key={`field-${field.key}`} flexDirection="column" marginBottom={1}>
          <Text bold>{label}</Text>
          <Text dimColor>{help}</Text>
          {control(field)}
        </Box>
      ) : (
        <Box key={`field-${field.key}`} flexDirection="row" justifyContent="space-between" alignItems="center" marginBottom={1}>
          <Box flexDirection="column" flexShrink={1}>
            <Text bold>{label}</Text>
            <Text dimColor>{help}</Text>
          </Box>
          {control(field)}
        </Box>
      )
    }

    const group = (id: 'view' | 'notify') => (
      <Box key={`group-${id}`} {...FRAME}>
        <Box marginBottom={1}>
          <Text bold dimColor>
            {id === 'view' ? f.view : f.notify}
          </Text>
        </Box>
        {FIELDS.filter(x => x.group === id).map(fieldRow)}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        {group('view')}
        {group('notify')}
        <Text dimColor>{f.footer}</Text>
      </Box>
    )
  })

  // Every start: the Agent tool, forks, teammates, workflow agents, nested ones.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined) return started

    const at = await $.clock.now()
    const run: CrewRun = {
      id: started.agentId ?? `${e.tool_use_id}:${e.workflow?.agentIndex ?? 0}`,
      agentId: started.agentId,
      kind: kindOf(e),
      type: e.subagentType,
      description: e.description,
      prompt: e.prompt.slice(0, MAX_TEXT),
      name: e.name,
      model: started.model,
      isBackground: e.background,
      parentId: e.parentAgentId,
      workflowRunId: e.workflow?.runId || undefined,
      workflowIndex: e.workflow?.agentIndex,
      status: 'running',
      startedAt: at,
      contextTokens: 0,
      contextMax: windowOf(started.model),
      tokens: 0,
      costUsd: 0,
      steps: 0,
    }
    await update($, runs, list => trimRuns([...list.filter(r => r.id !== run.id), run]))
    await update($, now, () => at)
    await refreshStatus($)

    const p = await readPanel($)
    if (p.tab !== 'active') await setPanel($, () => ({ tab: 'active' }))
    if (opts.autoOpen !== false && !p.hasAutoOpened) {
      await setPanel($, () => ({ hasAutoOpened: true }))
      void $.ui.open({ id: PANE, title: tr().pane })
    }
    return started
  })

  // Every tool call, the main loop's and each subagent's: the log and the files.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    const input = e as unknown as Loose
    const out = (result as { result?: unknown }).result
    const isOk = !result.deny && !result.isError
    await record($, e.tool, input, out && typeof out === 'object' ? (out as Loose) : undefined, isOk, e.agentId).catch(() => undefined)
    return result
  })

  // Each model request of a subagent: live context, tokens and cost, and what it said.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const agentId = e.agentId
    const usage = result.usage
    // The main chat's own requests: counted for the cost section.
    if (!agentId) {
      if (usage) {
        const model = usage.model || e.model
        await update($, mainCost, m => ({
          cost: (m?.cost ?? 0) + costOf(model, usage),
          tokens: (m?.tokens ?? 0) + freshOf(usage),
          cache: (m?.cache ?? 0) + cacheOf(usage),
        }))
      }
      return result
    }

    // Not spawned through agent.spawn while the mod listened: the list may know it.
    if (!(await read($, runs)).some(r => r.agentId === agentId)) await reconcile($)
    const list = await read($, runs)
    if (!list.some(r => r.agentId === agentId)) return result

    const said = result.answer?.trim()
    if (said) await pushLog($, agentId, { at: await $.clock.now(), kind: 'say', text: said.slice(0, 600) })
    if (!usage) return result

    const model = usage.model || e.model
    const wasIdle = list.some(r => r.agentId === agentId && r.status !== 'running')
    await update($, runs, l =>
      l.map(
        (r): CrewRun =>
          r.agentId !== agentId
            ? r
            : {
                ...r,
                model,
                effort: typeof e.effort === 'string' ? e.effort : r.effort,
                status: 'running',
                endedAt: undefined,
                contextTokens: sumOf(usage),
                contextMax: windowOf(model),
                tokens: r.tokens + freshOf(usage),
                cacheTokens: (r.cacheTokens ?? 0) + cacheOf(usage),
                costUsd: r.costUsd + costOf(model, usage),
                steps: r.steps + 1,
              },
      ),
    )
    if (wasIdle) await refreshStatus($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId && (await read($, runs)).some(r => r.agentId === agentId)) {
      const at = await $.clock.now()
      await update($, runs, list =>
        list.map(r => {
          if (r.agentId !== agentId) return r
          // A teammate goes idle between turns and wakes on a message.
          const status: CrewStatus =
            e.reason === 'answer' ? (r.kind === 'teammate' ? 'idle' : 'done') : e.reason === 'aborted' ? 'stopped' : 'failed'
          // A run whose steps went unseen still gets the turn's own sum.
          const fallback = r.steps === 0 && e.usage
          return {
            ...r,
            status,
            endedAt: at,
            lastAnswer: e.answer ? e.answer.slice(0, MAX_TEXT) : r.lastAnswer,
            ...(fallback && e.usage
              ? {
                  model: e.usage.model || r.model,
                  tokens: freshOf(e.usage),
                  cacheTokens: cacheOf(e.usage),
                  costUsd: costOf(e.usage.model || r.model, e.usage),
                }
              : {}),
          }
        }),
      )
      await update($, now, () => at)
      await refreshStatus($)
      const run = (await read($, runs)).find(r => r.agentId === agentId)
      if (run) void announceEnd($, run).catch(() => undefined)
    }
    return next(e)
  })

  // The engine pushes context and rate-limit figures after each main-thread turn.
  on('session.measure', async ($, e, next) => {
    await storeUsage($, e.context, e.rateLimits)
    if (opts.limitWarnings !== false) void warnLimits($).catch(() => undefined)
    return next(e)
  })

  // A click on a tab of the Client tab strip.
  on('ui.message', async ($, e, next) => {
    if (e.requestId !== PANE || e.element !== 'tabs' || !e.data || typeof e.data !== 'object') return next(e)
    const tab = (e.data as { tab?: unknown }).tab
    if (tab === 'active' || tab === 'done') await setPanel($, () => ({ tab }))
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const s = tr()
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const list = await read($, runs)
    const allLogs = await read($, logs)
    const p = await readPanel($)
    const gone = await read($, cleared)
    const fileList = await read($, files)
    const g = await read($, git)
    const at = Math.max(await read($, now), ...list.map(r => r.startedAt), 0)
    const viewed = e.props.view?.agentId
    const byAgent = new Map(list.filter(r => r.agentId).map(r => [r.agentId ?? '', r]))
    const base = g?.root ?? posix(await $.session.cwd())
    const isDesktop = e.surface === 'desktop' && 'Svg' in ui

    const activeCount = list.filter(isActive).length
    const doneCount = list.length - activeCount
    const shown = ordered(tabRuns(list, p.tab))
    const t = totals(list, at, gone)
    // Cost: the main chat's own requests and the subagents', apart.
    const mainRaw = await read($, mainCost)
    const main = { cost: mainRaw.cost, tokens: mainRaw.tokens, cache: mainRaw.cache ?? 0 }
    const subs = { cost: t.cost, tokens: t.tokens, cache: t.cache }
    const mainShare = main.cost + subs.cost > 0 ? main.cost / (main.cost + subs.cost) : 0
    // The session totals (cost, tokens, time) are opt-in; each agent keeps its own.
    const showTotals = opts.showTotals === true
    const showUsage = opts.showUsage !== false
    // Drawn again when a setting changes in the settings pane.
    await read($, settingsRev)
    const meters = metersOf(await read($, usage))
    const settingsRow = (
      <Box key="settings-row" flexDirection="row" justifyContent="flex-end">
        <Button key="open-settings" label={`⚙ ${ft().open}`} plain onPress={() => openSettings($)} />
      </Box>
    )
    const compactButton = (
      <Button
        key="run-compact"
        label="/compact"
        plain
        onPress={() => {
          // A press's own work is dropped when the press ends: the run gets a dispatch of its own.
          $.clock.after(1, () => void $.command.run({ command: 'compact' }).catch(() => undefined))
        }}
      />
    )
    const summary = `${activeCount} ${s.active.toLowerCase()} · ${doneCount} ${s.finished.toLowerCase()} · ≈${fmtCost(t.cost)}, ${fmtTokens(t.tokens)} ${s.tokensWord}, ${fmtTime(t.time)}`

    // --- tabs: browser-style in a Client where the surface has one, Buttons elsewhere.
    const Client = 'Client' in ui ? ui.Client : undefined
    const tabSpecs: Tab[] = [
      { id: 'active', icon: activeCount ? '●' : '○', label: s.active, count: activeCount, color: CLAY },
      { id: 'done', icon: '✓', label: s.finished, count: doneCount, color: COMMIT_COLOR },
    ]
    // The desktop sets text in a proportional face, so box-drawing art cannot
    // line up there: its tabs are bordered Boxes the app draws itself.
    const boxTabs = (
      <Box key="tab-row" flexDirection="row" alignItems="flex-end">
        {tabSpecs.map(t => {
          const isOn = p.tab === t.id
          return (
            <Box
              key={`tabbox-${t.id}`}
              borderStyle="round"
              borderColor={isOn ? t.color : '#6b6b68'}
              borderDimColor={!isOn}
              paddingX={1}
              marginRight={1}
              hover={{ borderColor: isOn ? t.color : '#9a9a96' }}
            >
              <Button key={`tab-${t.id}`} plain onPress={() => setPanel($, () => ({ tab: t.id as CrewTab }))}>
                <Text color={isOn ? t.color : undefined} dimColor={!isOn}>
                  {t.icon}
                </Text>{' '}
                <Text bold={isOn} dimColor={!isOn}>
                  {t.label}
                </Text>{' '}
                <Text color={isOn ? t.color : undefined} dimColor>
                  {String(t.count)}
                </Text>
              </Button>
            </Box>
          )
        })}
      </Box>
    )
    const tabStrip =
      e.surface === 'desktop' ? (
        boxTabs
      ) : Client ? (
        <Client
          key="tabs"
          module="./tabs.tsx"
          width="100%"
          height={3}
          props={{ tabs: tabSpecs, active: p.tab, line: '#8a8a86', dim: '#6b6b68' } satisfies TabsProps}
        />
      ) : (
        <Box flexDirection="row" gap={1}>
          {tabSpecs.map(t => (
            <Button
              key={`tab-${t.id}`}
              label={`${t.icon} ${t.label} · ${t.count}`}
              variant={p.tab === t.id ? 'primary' : 'secondary'}
              onPress={() => setPanel($, () => ({ tab: t.id as CrewTab }))}
            />
          ))}
        </Box>
      )
    const toggleCompact = (
      <Button key="compact" label={p.isCompact ? `⤢ ${s.expand}` : `⤡ ${s.collapse}`} variant="secondary" onPress={() => setPanel($, q => ({ isCompact: !q.isCompact }))} />
    )
    // A real button, at the bottom right of the agents' frame.
    const clearDone =
      doneCount > 0 ? (
        <Box key="clear-row" flexDirection="row" justifyContent="flex-end" marginTop={1}>
          <Button
            key="clear"
            label={`✕ ${s.clear} (${doneCount})`}
            variant="secondary"
            onPress={async () => {
              const gone = (await read($, runs)).filter(r => !isActive(r))
              await update($, cleared, c => ({
                cost: c.cost + gone.reduce((sum, r) => sum + r.costUsd, 0),
                tokens: c.tokens + gone.reduce((sum, r) => sum + r.tokens, 0),
                cache: (c.cache ?? 0) + gone.reduce((sum, r) => sum + (r.cacheTokens ?? 0), 0),
              }))
              await update($, runs, l => l.filter(isActive))
            }}
          />
        </Box>
      ) : null

    // --- one run's details: task, recent actions, files, answer.
    const details = (r: CrewRun) => {
      const entries = (r.agentId ? allLogs[r.agentId] : undefined) ?? []
      const recent = entries.slice(-10).reverse()
      const mine = r.agentId ? fileList.filter(f => f.agents.includes(r.agentId ?? '')) : []
      const reads = mine.filter(f => f.reads > 0).length
      const writes = mine.filter(f => f.writes > 0).length
      // Drawn inside the agent's card, which carries the indent and the colour.
      const pad = ''
      return (
        <Box key={`det-${r.id}`} flexDirection="column" marginTop={1}>
          {r.prompt && (
            <Text dimColor wrap="wrap">
              {pad}
              {s.task}: {oneLine(r.prompt, 280)}
            </Text>
          )}
          <Text bold>
            {pad}
            {s.recent}
          </Text>
          {recent.length === 0 && (
            <Text dimColor>
              {pad}
              {s.nothingYet}
            </Text>
          )}
          {recent.map((l, i) => (
            <Text key={`log-${r.id}-${i}`} wrap="truncate-end">
              {pad}
              <Text dimColor>{fmtAgo(at - l.at).padStart(4)} </Text>
              {l.kind === 'say' ? (
                <Text italic dimColor>
                  💬 {oneLine(l.text, 200)}
                </Text>
              ) : (
                <Text>
                  <Text color={l.isError ? 'red' : colorOf(r)} bold>
                    {l.tool}
                  </Text>{' '}
                  {l.text}
                  {l.isError ? ' ✗' : ''}
                </Text>
              )}
            </Text>
          ))}
          {mine.length > 0 && (
            <Box flexDirection="row" gap={1}>
              <Text dimColor>
                {pad}
                {s.touched(reads, writes)}
              </Text>
              <Button
                key={`focus-${r.id}`}
                label={p.focusAgent === r.agentId ? s.focusOff : s.focusOn}
                plain
                onPress={() => setPanel($, q => ({ focusAgent: q.focusAgent === r.agentId ? undefined : r.agentId }))}
              />
            </Box>
          )}
          {r.lastAnswer && (
            <Text bold>
              {pad}
              {s.answer}
            </Text>
          )}
          {r.lastAnswer &&
            ('Markdown' in ui ? (
              <ui.Markdown key={`ans-${r.id}`} text={r.lastAnswer.slice(0, 1500) + (r.lastAnswer.length > 1500 ? ' …' : '')} />
            ) : (
              <Text wrap="wrap">{oneLine(r.lastAnswer, 600)}</Text>
            ))}
          {r.lastAnswer && (
            <Button
              key={`copy-${r.id}`}
              label={s.copy}
              plain
              onPress={async () => {
                await $.ui.copy({ text: r.lastAnswer ?? '' })
                $.ui.toast(s.copied)
              }}
            />
          )}
        </Box>
      )
    }

    // Sits at the right of its agent's first line.
    const detailsButton = (r: CrewRun) => {
      const isOpen = p.expanded.includes(r.id)
      return (
        <Button
          key={`d-${r.id}`}
          label={isOpen ? '▾' : '▸'}
          plain
          onPress={() =>
            setPanel($, q => ({ expanded: q.expanded.includes(r.id) ? q.expanded.filter(x => x !== r.id) : [...q.expanded, r.id].slice(-20) }))
          }
        />
      )
    }

    // --- the files section.
    const views = fileViews(fileList, g, base, p.fileFilter)
    const branch = g ? `⑂ ${g.branch || 'HEAD'}${g.ahead ? ` ↑${g.ahead}` : ''}${g.behind ? ` ↓${g.behind}` : ''}` : ''
    const focusRun = p.focusAgent ? byAgent.get(p.focusAgent) : undefined
    const filesHeader = (
      <Box key="files-head" flexDirection="row" gap={1}>
        <Button
          key="files-toggle"
          label={`${p.isFilesCollapsed ? '▸' : '▾'} ${s.files} · ${views.length}`}
          plain
          onPress={() => setPanel($, q => ({ isFilesCollapsed: !q.isFilesCollapsed }))}
        />
        <Button
          key="files-filter"
          label={p.fileFilter === 'all' ? s.changedOnly : s.allFiles}
          plain
          onPress={() => setPanel($, q => ({ fileFilter: q.fileFilter === 'all' ? 'changed' : 'all' }))}
        />
        {branch && <Text dimColor>{branch}</Text>}
        {focusRun && (
          <Button key="focus-clear" plain onPress={() => setPanel($, () => ({ focusAgent: undefined }))}>
            <Text color={colorOf(focusRun)}>◎ {oneLine(focusRun.description || typeLabel(focusRun), 30)}</Text> ✕
          </Button>
        )}
      </Box>
    )

    // About 8 CSS px a column on the desktop, less the frame's border and padding.
    const desktopW = Math.max(220, Math.min(900, ((e.props.bodyColumns || 40) - FRAME_COLS) * 8 - 8))

    // One file row is one Button: a press opens its history and diff beneath it.
    const fileTree = treeRows(views.map(v => ({ key: v.key, label: v.label })))
    const viewByKey = new Map(views.map(v => [v.key, v]))
    const openDiff = await read($, diff)
    const fileDetails = (v: FileView, pad: string) => {
      const hist = [...(v.file?.history ?? [])].reverse().slice(0, 8)
      const d = openDiff && openDiff.key === v.key ? openDiff : null
      const Code = 'Code' in ui ? ui.Code : undefined
      return (
        <Box key={`fd-${v.key}`} flexDirection="column" marginTop={1}>
          {v.file?.conflict && v.file.conflict.length > 1 && (
            <Text color="red">
              {pad}
              {s.conflictLine(v.file.conflict.map(a => (a === 'main' ? s.main : byAgent.get(a)?.description || a.slice(0, 8))).join(', '))}
            </Text>
          )}
          {hist.length > 0 && (
            <Text bold dimColor>
              {pad}
              {s.history}
            </Text>
          )}
          {hist.map((ev, i) => (
            <Text key={`h-${v.key}-${i}`} wrap="truncate-end">
              {pad}
              <Text dimColor>{fmtAgo(at - ev.at).padStart(4)} </Text>
              <Text color={ev.kind === 'read' ? READ_COLOR : ev.kind === 'write' ? WRITE_COLOR : COMMIT_COLOR}>{s.histKind[ev.kind]}</Text>
              <Text dimColor> · </Text>
              <Text color={agentColor(ev.agent, byAgent)}>
                {ev.agent === 'main' ? s.main : ev.agent === 'git' ? 'git' : byAgent.get(ev.agent)?.description || ev.agent.slice(0, 8)}
              </Text>
            </Text>
          ))}
          {d && (
            <Text bold dimColor>
              {pad}
              {d.format === 'source' ? s.newFile : s.changes}
            </Text>
          )}
          {d && Code && <Code key={`code-${v.key}`} source={d.text} format={d.format} path={v.label} wrap="truncate-end" />}
          {d && !Code && <Text>{d.text.slice(0, 2000)}</Text>}
          {!d && v.gitFile && !v.gitFile.code.includes('?') && (
            <Text dimColor>
              {pad}
              {s.noDiff}
            </Text>
          )}
        </Box>
      )
    }
    // The desktop draws each row as a picture (colours, agent dots, the pulse of a
    // fresh file) with a small button beside it; other surfaces a text Button.
    const RowSvg = isDesktop && 'Svg' in ui ? ui.Svg : undefined
    const rowW = desktopW - 36
    const fileRow = (r: (typeof fileTree)[number]) => {
      const pad = '  '.repeat(r.depth)
      if (r.isDir)
        return RowSvg ? (
          <RowSvg key={`f-${r.key}`} source={dirRowSvg(rowW, r.name, r.depth)} alt={`${r.name}/`} width={rowW} height={FILE_ROW_H} />
        ) : (
          <Text key={`f-${r.key}`} dimColor wrap="truncate-end">
            {pad}▾ {r.name}/
          </Text>
        )
      const v = viewByKey.get(r.key)
      if (!v) return null
      const color = fileColor(v)
      const badge = gitBadge(v)
      const isFresh = Boolean(v.file && at - v.file.lastAt < FRESH_MS)
      const isOpen = p.openFile === v.key
      const isDim = Boolean(p.focusAgent && !(v.file?.agents ?? []).includes(p.focusAgent))
      const hasConflict = (v.file?.conflict?.length ?? 0) > 1
      const toggle = async () => {
        const opening = (await readPanel($)).openFile !== v.key
        await setPanel($, () => ({ openFile: opening ? v.key : undefined }))
        if (opening) await loadDiff($, v.key)
      }
      // An open file and its history and diff share a card framed in the file's
      // colour (red on a conflict), indented by its depth in the tree.
      const frame = isOpen ? card(hasConflict ? '#D0453F' : color, r.depth) : { flexDirection: 'column' as const }
      if (RowSvg) {
        const w = isOpen ? rowW - FRAME_COLS * 8 - r.depth * 16 : rowW
        return (
          <Box key={`f-${r.key}`} {...frame}>
            <Box flexDirection="row" alignItems="center">
              <RowSvg
                source={fileRowSvg(w, r.name, isOpen ? 0 : r.depth, v, byAgent, { isFresh, isOpen: false, isDim, hasConflict })}
                alt={`${r.name}${badge ? ', ' + badge : ''}${hasConflict ? ', ⚠' : ''}`}
                width={w}
                height={FILE_ROW_H}
              />
              <Button key={`file-${r.key}`} label={isOpen ? '▾' : '▸'} plain onPress={toggle} />
            </Box>
            {isOpen && fileDetails(v, '')}
          </Box>
        )
      }
      return (
        <Box key={`f-${r.key}`} {...frame}>
          <Button key={`file-${r.key}`} plain onPress={toggle}>
            {isOpen ? '' : pad}
            <Text dimColor>{isOpen ? '▾ ' : '  '}</Text>
            <Text color={color} dimColor={isDim}>
              {fileGlyph(v)}
            </Text>{' '}
            <Text bold={isFresh || isOpen} color={isFresh ? color : undefined} dimColor={isDim}>
              {r.name}
            </Text>{' '}
            {(v.file?.agents.slice(0, 6) ?? []).map(a => (
              <Text key={`fa-${r.key}-${a}`} color={agentColor(a, byAgent)} dimColor={isDim}>
                ●
              </Text>
            ))}
            {badge ? (
              <Text color={v.gitFile ? WRITE_COLOR : COMMIT_COLOR} dimColor={isDim}>
                {' '}
                {badge}
              </Text>
            ) : null}
            {hasConflict ? <Text color="red"> ⚠</Text> : null}
          </Button>
          {isOpen && fileDetails(v, '')}
        </Box>
      )
    }
    const filesBody = (
      <Box key="files-body" flexDirection="column">
        {!p.isFilesCollapsed && views.length === 0 && <Text dimColor>{s.noFiles}</Text>}
        {!p.isFilesCollapsed && fileTree.slice(0, MAX_FILE_ROWS).map(fileRow)}
        {!p.isFilesCollapsed && fileTree.length > MAX_FILE_ROWS && <Text dimColor>{s.more(fileTree.length - MAX_FILE_ROWS)}</Text>}
        {!p.isFilesCollapsed && views.length > 0 && <Text dimColor>{s.legend}</Text>}
      </Box>
    )

    // --- the timeline, by the `showTimeline` option.
    const showTimeline = opts.showTimeline !== false && list.length > 0
    const timelineToggle = (
      <Button
        key="timeline-toggle"
        label={`${p.isTimelineOpen ? '▾' : '▸'} ${s.timeline}`}
        plain
        onPress={() => setPanel($, q => ({ isTimelineOpen: !q.isTimelineOpen }))}
      />
    )

    if (isDesktop && 'Svg' in ui) {
      const { Svg } = ui
      const W = desktopW
      // The row's picture leaves room at its right for the Details button. An
      // expanded agent and its details share a card framed in the agent's colour,
      // indented by its depth; the picture inside it draws no indent of its own.
      const runW = W - 36
      const row = ({ run, depth }: { run: CrewRun; depth: number }) => {
        const isOpen = p.expanded.includes(run.id)
        const w = isOpen ? runW - FRAME_COLS * 8 - depth * 16 : runW
        const line = (
          <Box flexDirection="row" alignItems="flex-start" justifyContent="space-between">
            <Svg
              source={runSvg(w, run, isOpen ? 0 : depth, byAgent, at, run.agentId !== undefined && run.agentId === viewed)}
              alt={`${run.description || typeLabel(run)}: ${typeLabel(run)}, ${modelName(run.model)}, ${isActive(run) ? s.isRunning : s.isFinished}`}
              width={w}
              height={ROW_H}
            />
            {detailsButton(run)}
          </Box>
        )
        return isOpen ? (
          <Box key={`row-${run.id}`} {...cardOf(run, depth)}>
            {line}
            {details(run)}
          </Box>
        ) : (
          <Box key={`row-${run.id}`} flexDirection="column">
            {line}
          </Box>
        )
      }
      const timeline = showTimeline && p.isTimelineOpen ? timelineSvg(W, list, at) : null

      // Compact folds the agents' frame alone: a row of crabs each for active and finished.
      const compact = compactSvg(W, list.filter(isActive), list.filter(r => !isActive(r)), null)
      const agentsCompact = (
        <Box key="sec-agents" {...FRAME}>
          <Box flexDirection="row" justifyContent="flex-end" alignItems="center">
            {toggleCompact}
          </Box>
          <Svg source={compact.source} alt={summary} width={W} height={compact.height} />
        </Box>
      )
      return (
        <Box flexDirection="column" gap={1}>
          {settingsRow}
          {showUsage && meters.length > 0 && (
            <Box key="sec-usage" {...FRAME}>
              <Box flexDirection="row" justifyContent="space-between" alignItems="center">
                <Text bold dimColor>
                  {s.usage}
                </Text>
                {compactButton}
              </Box>
              <Svg source={usageSvg(W, meters, at)} alt={meters.map(m => `${m.percent}% ${m.label}`).join(', ')} width={W} height={USAGE_H} />
            </Box>
          )}
          {showTotals && (
            <Box key="sec-totals" {...FRAME}>
              <Box marginBottom={1}>
                <Text bold dimColor>
                  {s.totalsTitle}
                </Text>
              </Box>
              <Svg source={costSvg(W, main, subs, list.length)} alt={`${s.main} ≈${fmtCost(main.cost)}, ${s.subagents(list.length)} ≈${fmtCost(subs.cost)}`} width={W} height={COST_H} />
              <Text dimColor wrap="wrap">
                {s.costNote}
              </Text>
            </Box>
          )}
          {p.isCompact ? (
            agentsCompact
          ) : (
            <Box key="sec-agents" {...FRAME}>
              <Box flexDirection="row" justifyContent="space-between" alignItems="center">
                {tabStrip}
                {toggleCompact}
              </Box>
              {shown.length === 0 && <Text dimColor>{p.tab === 'active' ? s.noActive : s.noDone}</Text>}
              {shown.map(row)}
              {clearDone}
            </Box>
          )}
          {showTimeline && (
            <Box key="sec-timeline" {...FRAME}>
              {timelineToggle}
              {timeline && <Svg source={timeline.source} alt={s.timeline} width={W} height={timeline.height} />}
            </Box>
          )}
          <Box key="sec-files" {...FRAME}>
            {filesHeader}
            {filesBody}
          </Box>
        </Box>
      )
    }

    // Terminal and the other surfaces: the same content in text rows.
    const cols = Math.max(24, (e.props.bodyColumns || 40) - FRAME_COLS)
    const costBarW = Math.max(6, cols - 2)
    const barW = Math.max(6, Math.min(20, cols - 34))
    const bar = (pct: number) => {
      const filled = Math.round((barW * pct) / 100)
      return '█'.repeat(filled) + '░'.repeat(Math.max(0, barW - filled))
    }
    const row = ({ run, depth }: { run: CrewRun; depth: number }) => {
      const color = colorOf(run)
      const ctx = ctxOf(run)
      const isOpen = p.expanded.includes(run.id)
      // Inside its card an expanded agent takes its indent from the card.
      const pad = isOpen ? '' : '  '.repeat(depth)
      const isViewed = run.agentId !== undefined && run.agentId === viewed
      return (
        <Box key={`row-${run.id}`} {...(isOpen ? cardOf(run, depth) : { flexDirection: 'column' as const })} marginBottom={1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Box flexDirection="row" gap={1} flexShrink={1}>
              <Text color={color}>
                {pad}
                {depth && !isOpen ? '└' : ''}
                {isViewed ? '▶' : '▣'}
              </Text>
              <Text bold wrap="truncate-end">
                {run.description || typeLabel(run)}
              </Text>
              <Text color={run.status === 'failed' ? 'red' : run.status === 'done' ? 'green' : color}>{STATUS_GLYPH[run.status]}</Text>
            </Box>
            {detailsButton(run)}
          </Box>
          <Text dimColor wrap="truncate-end">
            {pad}
            {'  '}
            {typeLabel(run)} · {metaOf(run, byAgent).join(' · ')}
          </Text>
          {run.lastAction && (
            <Text dimColor wrap="truncate-end">
              {pad}
              {'  '}› {run.lastAction}
            </Text>
          )}
          <Text wrap="truncate-end">
            {pad}
            {'  '}
            <Text color={color}>{bar(run.status === 'done' ? 100 : ctx)}</Text>
            <Text dimColor>
              {' '}
              ctx {ctx}% · {fmtTokens(run.contextTokens)} ≈{fmtCost(run.costUsd)} {fmtTime(elapsed(run, at))}
            </Text>
          </Text>
          {p.expanded.includes(run.id) && details(run)}
        </Box>
      )
    }

    // The timeline in text: one bar a run on a shared axis.
    const timelineRows = () => {
      const items = timelineRuns(list)
      const labelW = Math.min(18, Math.floor(cols * 0.35))
      const w = Math.max(8, cols - labelW - 2)
      // Pauses fold into a 3-cell break `┊`, as on the desktop.
      const axis = timelineAxis(items, at, w, 3)
      const breakCols = axis.breaks.map(b => Math.round(b.x) + 1)
      const lineOf = (from: number, to: number, color: string) => {
        const cells = [...Array(w)].map((_, c) => (breakCols.includes(c) ? '┊' : c >= from && c < to ? '━' : '·'))
        return cells.map((ch, c) => (
          <Text key={`c${c}`} color={ch === '━' ? color : undefined} dimColor={ch !== '━'}>
            {ch}
          </Text>
        ))
      }
      return items.map(r => {
        const from = Math.floor(axis.xOf(r.startedAt))
        const to = Math.max(from + 1, Math.round(axis.xOf(r.endedAt ?? at)))
        const name = oneLine(r.description || typeLabel(r), labelW).padEnd(labelW)
        return (
          <Text key={`tl-${r.id}`} wrap="truncate-end">
            <Text dimColor>{name} </Text>
            {lineOf(from, to, r.status === 'failed' ? 'red' : colorOf(r))}
          </Text>
        )
      })
    }

    const meterRow = (m: Meter) => {
      const w = Math.max(6, Math.min(24, cols - 30))
      const filled = Math.round((w * m.percent) / 100)
      const reset = m.resetsAt ? resetIn(m.resetsAt, at) : ''
      return (
        <Text key={`m-${m.key}`} wrap="truncate-end">
          <Text color={meterColor(m.percent)}>{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(Math.max(0, w - filled))}</Text> <Text bold>{`${m.percent}%`.padStart(4)}</Text> {m.label}
          <Text dimColor>
            {m.detail ? ` · ${m.detail}` : ''}
            {reset ? ` · ${reset}` : ''}
          </Text>
        </Text>
      )
    }

    return (
      <Box flexDirection="column">
        {settingsRow}
        {showUsage && meters.length > 0 && (
          <Box key="sec-usage" {...FRAME}>
            <Box flexDirection="row" justifyContent="space-between">
              <Text bold dimColor>
                {s.usage}
              </Text>
              {compactButton}
            </Box>
            {meters.map(meterRow)}
          </Box>
        )}
        {showTotals && (
          <Box key="sec-totals" {...FRAME}>
            <Text bold dimColor>
              {s.totalsTitle}
            </Text>
            {(
              [
                ['cost-main', s.main, main, CLAY],
                ['cost-subs', s.subagents(list.length), subs, SUB_COLOR],
              ] as const
            ).map(([key, label, part, color]) => (
              <Box key={key} flexDirection="row" justifyContent="space-between">
                <Text wrap="truncate-end">
                  <Text color={color}>● </Text>
                  {label}
                </Text>
                <Text>
                  <Text dimColor>
                    {fmtTokens(part.tokens)} {s.fresh} · {fmtTokens(part.cache)} {s.cached}{'  '}
                  </Text>
                  <Text bold>≈{fmtCost(part.cost)}</Text>
                </Text>
              </Box>
            ))}
            <Text wrap="truncate-end">
              <Text color={CLAY}>{'█'.repeat(Math.round(costBarW * mainShare))}</Text>
              <Text color={SUB_COLOR} dimColor={main.cost + subs.cost === 0}>
                {(main.cost + subs.cost === 0 ? '░' : '█').repeat(costBarW - Math.round(costBarW * mainShare))}
              </Text>
            </Text>
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor>{s.total}</Text>
              <Text>
                <Text dimColor>
                  {fmtTokens(main.tokens + subs.tokens)} {s.fresh} · {fmtTokens(main.cache + subs.cache)} {s.cached}{'  '}
                </Text>
                <Text bold>≈{fmtCost(main.cost + subs.cost)}</Text>
              </Text>
            </Box>
            <Text dimColor wrap="wrap">
              {s.costNote}
            </Text>
          </Box>
        )}
        <Box key="sec-agents" {...FRAME}>
          <Box flexDirection="row" justifyContent="flex-end">
            {toggleCompact}
          </Box>
          {p.isCompact ? (
            <Box flexDirection="column">
              {(
                [
                  ['c-active', s.active, list.filter(isActive), CLAY],
                  ['c-done', s.finished, list.filter(r => !isActive(r)), COMMIT_COLOR],
                ] as const
              ).map(([key, label, runsOf, color]) => (
                <Text key={key} wrap="truncate-end">
                  <Text color={color}>● </Text>
                  <Text bold>{label.padEnd(8)}</Text>
                  <Text dimColor>{String(runsOf.length).padStart(3)} </Text>
                  {runsOf.length === 0 ? (
                    <Text dimColor>—</Text>
                  ) : (
                    runsOf.map(run => (
                      <Text
                        key={`${key}-${run.id}`}
                        color={run.status === 'failed' ? 'red' : run.status === 'done' ? 'green' : colorOf(run)}
                        dimColor={!isActive(run) && run.status !== 'failed'}
                      >
                        {STATUS_GLYPH[run.status]}{' '}
                      </Text>
                    ))
                  )}
                </Text>
              ))}
            </Box>
          ) : (
            <Box flexDirection="column">
              {tabStrip}
              {shown.length === 0 && <Text dimColor>{p.tab === 'active' ? s.noActive : s.noDone}</Text>}
              {shown.map(row)}
              {clearDone}
            </Box>
          )}
        </Box>
        {showTimeline && (
          <Box key="sec-timeline" {...FRAME}>
            {timelineToggle}
            {p.isTimelineOpen && timelineRows()}
          </Box>
        )}
        <Box key="sec-files" {...FRAME}>
          {filesHeader}
          {filesBody}
        </Box>
      </Box>
    )
  })
}
