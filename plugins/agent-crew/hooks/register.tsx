import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register } from 'claude-code'

import type { CrewUpdate, CrewUsage } from '../types'
import type { CrewFile, CrewGit, CrewGitFile, CrewKind, CrewLog, CrewPanel, CrewRun, CrewStatus, CrewTab } from '../types'
import { CLAY, FLIP_MS, FONT, crab, fitText, svg, textWidth, xml } from './crab'
import type { FileRowSpec, FileRowsProps, Seg } from './filerows'
import type { SearchBoxProps } from './searchbox'
import { applyNumstat, filesBeneath, folderKeys, folderOf, inside, isNewer, keyOf, mayChange, openCommand, parseStatus, posix, rawGithubUrl, readTargets, resolve, rowsUnder, treeRows, underFolder, useDrives, visibleRows } from './files'
import type { TreeRow } from './files'
import type { HotSeg, HotspotProps } from './hotspot'
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
  fileFilter: 'activity',
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
const tree = atom({ plugin: 'agent-crew', key: 'tree' } as const, null)
const updateInfo = atom({ plugin: 'agent-crew', key: 'update' } as const, null)

// The plugin's options, set by register on every (re)load.
let opts: Record<string, unknown> = {}

const MAX_HISTORY = 12
const MAX_DIFF = 30_000
/** An untracked file larger than this is not read for its card. */
const MAX_SOURCE_BYTES = 256 * 1024
/** Two agents changing one file within this window is a conflict. */
const CONFLICT_MS = 10 * 60_000

const PANE = 'agent-crew'
const MAX_RUNS = 300
const MAX_CLEARED = 2000
const MAX_FILES = 400
const MAX_LOG = 40
const MAX_TEXT = 4000
const FRESH_MS = 8000

const READ_COLOR = '#a855f7'
const WRITE_COLOR = '#f97316'
const COMMIT_COLOR = '#22c55e'
const DELETE_COLOR = '#ef4444'
const NEW_COLOR = '#3b82f6'

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
    steps: (n: number) => (n === 1 ? '1 Schritt' : `${n} Schritte`),
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
    fileFilters: { activity: 'Aktivität', changed: 'Änderungen', all: 'Alle' },
    noFiles: 'Noch keine Dateien gelesen oder geändert.',
    legend: { read: 'gelesen', write: 'geändert', isNew: 'neu', commit: 'committet', delete: 'gelöscht' },
    more: (n: number) => `… ${n} weitere`,
    main: 'Hauptchat',
    totalsTitle: 'Kosten',
    search: 'Dateien suchen',
    hits: (n: number) => `${n} Treffer`,
    noHits: 'Keine Datei passt zur Suche.',
    fresh: 'neu',
    cached: 'aus Cache',
    allHidden: 'Alle Abschnitte sind ausgeblendet.',
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
    updateAvailable: (v: string) => `agent-crew ${v} ist verfügbar: /crew-settings zum Aktualisieren`,
    updateDone: (v: string) => `agent-crew ${v} installiert, die Plugins laden neu`,
    updateFailed: (why: string) => `Update fehlgeschlagen: ${why}`,
    updateBadge: (v: string) => `↑ ${v}`,
    noHistory: 'Noch nichts aufgezeichnet.',
    openIt: 'Öffnen',
    openFailed: (name: string) => `${name} ließ sich nicht öffnen`,
    histKind: { read: 'gelesen', write: 'geändert', commit: 'committet' },
    changes: 'Änderungen',
    newFile: 'Neue Datei',
    noDiff: 'Kein Unterschied zu HEAD.',
    isNew: 'neu',
    isDeleted: 'gelöscht',
    statusRunning: (n: number) => `${n} Subagent${n === 1 ? '' : 'en'} aktiv`,
    bandDone: (n: number) => `${n} fertig`,
    bandFailed: (n: number) => `${n} mit Fehler`,
    bandDoneAgents: (n: number) => `${n} Subagent${n === 1 ? '' : 'en'} fertig`,
    bandFailedAgents: (n: number) => `${n} Subagent${n === 1 ? '' : 'en'} mit Fehler`,
    bandIdle: (n: number) => `${n} ${n === 1 ? 'wartet' : 'warten'}`,
    bandIdleAgents: (n: number) => (n === 1 ? '1 Subagent wartet' : `${n} Subagenten warten`),
    bandStopped: (n: number) => `${n} gestoppt`,
    bandStoppedAgents: (n: number) => `${n} Subagent${n === 1 ? '' : 'en'} gestoppt`,
    bandConflicts: (n: number) => `${n} Konflikt${n === 1 ? '' : 'e'}`,
    bandOpen: 'Crew öffnen',
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
    steps: (n: number) => (n === 1 ? '1 step' : `${n} steps`),
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
    fileFilters: { activity: 'Activity', changed: 'Changes', all: 'All' },
    noFiles: 'No files read or changed yet.',
    legend: { read: 'read', write: 'changed', isNew: 'new', commit: 'committed', delete: 'deleted' },
    more: (n: number) => `… ${n} more`,
    main: 'main chat',
    totalsTitle: 'Cost',
    search: 'Search files',
    hits: (n: number) => `${n} ${n === 1 ? 'hit' : 'hits'}`,
    noHits: 'No file matches the search.',
    fresh: 'new',
    cached: 'cached',
    allHidden: 'Every section is hidden.',
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
    updateAvailable: (v: string) => `agent-crew ${v} is available: /crew-settings to update`,
    updateDone: (v: string) => `agent-crew ${v} installed, plugins reloading`,
    updateFailed: (why: string) => `Update failed: ${why}`,
    updateBadge: (v: string) => `↑ ${v}`,
    noHistory: 'Nothing recorded yet.',
    openIt: 'Open',
    openFailed: (name: string) => `Could not open ${name}`,
    histKind: { read: 'read', write: 'changed', commit: 'committed' },
    changes: 'Changes',
    newFile: 'New file',
    noDiff: 'No difference to HEAD.',
    isNew: 'new',
    isDeleted: 'deleted',
    statusRunning: (n: number) => `${n} subagent${n === 1 ? '' : 's'} running`,
    bandDone: (n: number) => `${n} done`,
    bandFailed: (n: number) => `${n} failed`,
    bandDoneAgents: (n: number) => `${n} subagent${n === 1 ? '' : 's'} done`,
    bandFailedAgents: (n: number) => `${n} subagent${n === 1 ? '' : 's'} failed`,
    bandIdle: (n: number) => `${n} waiting`,
    bandIdleAgents: (n: number) => `${n} subagent${n === 1 ? '' : 's'} waiting`,
    bandStopped: (n: number) => `${n} stopped`,
    bandStoppedAgents: (n: number) => `${n} subagent${n === 1 ? '' : 's'} stopped`,
    bandConflicts: (n: number) => `${n} conflict${n === 1 ? '' : 's'}`,
    bandOpen: 'Open crew',
  },
} as const

// Module scope is fine for these: session.start sets them again on every (re)load.
let lang: Lang = 'en'
let fold = false
let home = ''
let gitQueued = false
let gitBusy = false
let tick = 0
// The flip book's timer, running only while an agent walks on a desktop pane.
let flipTimer: { cancel: () => void } | undefined
let desktopDrawnAt = -Infinity
// Drawings of the pane and the band under way. A tick of the clock while one is
// running would start the next before it ends: live, where each read crosses to
// the host, a drawing can take longer than a flip, and none would ever finish.
let drawing = 0
// By the `crabMotion` option: `smooth`, a flip book of stills redrawn four times
// a second; `light`, the crabs' own animation, which each redraw starts over.
const flipAt = (at: number): number | undefined => (opts.crabMotion === 'light' ? undefined : at)
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

// A bar in text cells, in eighths of a cell, so a slow estimate visibly grows.
const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']
const cellBar = (share: number, width: number): string => {
  const eighths = Math.round(width * 8 * Math.max(0, Math.min(1, share)))
  const full = Math.floor(eighths / 8)
  const part = EIGHTHS[eighths % 8] ?? ''
  return '█'.repeat(full) + part + '░'.repeat(Math.max(0, width - full - (part ? 1 : 0)))
}

// The estimate's pace: a third of the way after about a minute or a dozen
// model requests, the two adding up; it never passes ESTIMATE_CAP.
const ESTIMATE_SECONDS = 180
const ESTIMATE_STEPS = 20
const ESTIMATE_CAP = 0.9

/**
 * What an agent's bar shows. The engine reports no progress for a subagent, so
 * a running agent's bar is an estimate from its run time and its model requests:
 * quick at first, ever slower, short of full until it ends. Steps it reported
 * through savvy-progress replace the estimate. An ended run's bar is full, in
 * its end's colour. Context fill is only text beside it.
 */
type AgentBar = { share: number; color: string; label: string }

const barOf = (r: CrewRun, at: number): AgentBar => {
  const rep = r.report?.total ? r.report : undefined
  const label = rep ? `${rep.done}/${rep.total}${rep.note ? ` · ${rep.note}` : ''}` : ''
  if (r.status === 'done') return { share: 1, color: '#3B9C5F', label }
  if (r.status === 'failed') return { share: 1, color: '#D0453F', label }
  if (r.status === 'stopped') return { share: 1, color: '#9a9a96', label }
  if (rep) return { share: rep.done / rep.total, color: colorOf(r), label }
  const work = elapsed(r, at) / 1000 / ESTIMATE_SECONDS + r.steps / ESTIMATE_STEPS
  return { share: ESTIMATE_CAP * (1 - Math.exp(-work)), color: colorOf(r), label }
}

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

// Runs that leave the list keep their figures in the totals, and their ids, so
// the engine's list does not bring them back.
async function retire($: EngineInterface, gone: CrewRun[]): Promise<void> {
  if (!gone.length) return
  await update($, cleared, c => ({
    cost: c.cost + gone.reduce((sum, r) => sum + r.costUsd, 0),
    tokens: c.tokens + gone.reduce((sum, r) => sum + r.tokens, 0),
    cache: (c.cache ?? 0) + gone.reduce((sum, r) => sum + (r.cacheTokens ?? 0), 0),
    ids: [...(c.ids ?? []), ...gone.flatMap(r => (r.agentId ? [r.agentId] : []))].slice(-MAX_CLEARED),
  }))
}

// Writes the run list through the cap; what falls off is retired.
async function storeRuns($: EngineInterface, fn: (list: CrewRun[]) => CrewRun[]): Promise<void> {
  let gone: CrewRun[] = []
  await update($, runs, list => {
    const all = fn(list)
    const kept = trimRuns(all)
    gone = all.filter(r => !kept.includes(r))
    return kept
  })
  await retire($, gone)
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
  if (r.steps) meta.push(s.steps(r.steps))
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

// The status line entry, by the `statusLine` option.
async function refreshStatus($: EngineInterface): Promise<void> {
  const n = (await read($, runs)).filter(r => r.status === 'running').length
  $.ui.status(n && opts.statusLine !== false ? `🦀 ${tr().statusRunning(n)}` : undefined)
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
  const retired = new Set((await read($, cleared)).ids ?? [])
  let changed = false
  for (const info of list) {
    const i = next.findIndex(r => r.agentId === info.id)
    const status = statusFromList(info.status)
    if (i < 0) {
      // A cleared agent stays gone, unless it is working again.
      if (retired.has(info.id) && isTerminal(status)) continue
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
  await storeRuns($, () => next)
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
      // Several agents changing one file close together: flag it once. A commit
      // settles what came before it. The writes are kept apart from the shown
      // history, so reads in between never push the first of two writes out.
      let conflict = old.conflict
      const since = old.commitAt ?? -Infinity
      // A file from before the writes were kept apart (a reload mid-session) has
      // them in its history alone: take them from there once.
      const prior = old.recentWrites ?? (old.history ?? []).filter(h => h.kind === 'write').map(h => ({ at: h.at, agent: h.agent }))
      const recentWrites = [...prior, ...(kind === 'write' ? [{ at, agent }] : [])]
        .filter(w => at - w.at < CONFLICT_MS && w.at > since)
        .slice(-MAX_HISTORY)
      if (kind === 'write') {
        const writers = [...new Set(recentWrites.map(w => w.agent))]
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
        recentWrites: recentWrites.length ? recentWrites : undefined,
      }
      if (i < 0) list.push(f)
      else list[i] = f
    }
    return list.length > MAX_FILES ? [...list].sort((a, b) => b.lastAt - a.lastAt).slice(0, MAX_FILES) : list
  })
  await update($, now, () => at)
  await autoOpenPane($, 'files')
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
    // An untracked file shows as source: read only one of a sensible size, and
    // never a binary one, as this runs on every sync while the card is open.
    try {
      const st = await $.fs.stat(path)
      const body = st.kind === 'file' && st.size <= MAX_SOURCE_BYTES ? await $.fs.read(path) : ''
      text = body.includes('\u0000') ? '' : body
      format = 'source'
    } catch {
      text = ''
    }
  }
  // The hunks alone: git's header (diff --git, index, ---/+++) says nothing the card does not.
  if (format === 'diff') {
    const hunk = text.indexOf('\n@@')
    if (hunk >= 0) text = text.slice(hunk + 1)
  }
  const next = text ? { key, text: text.slice(0, MAX_DIFF), format } : null
  // Another file opened while git answered: this diff is no longer the card's.
  if ((await readPanel($)).openFile !== key) return
  if (JSON.stringify(await read($, diff)) !== JSON.stringify(next)) await update($, diff, () => next)
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
      if ((await readPanel($)).fileFilter === 'all') await syncTree($)
      return
    }
    const root = up.trim() ? resolve(cwd, up.trim(), home) : cwd
    const headOut = await runGit($, root, ['rev-parse', '--verify', '-q', 'HEAD'])
    const statusOut = await runGit($, root, ['status', '--porcelain=v1', '-b', '-z', '--untracked-files=all'])
    // A git call that failed (a timeout, a lock) says nothing: keep what was seen
    // rather than take an empty HEAD for a new repository and book it all as committed.
    // Only a status that says so makes an empty HEAD a repository with no commits.
    if (statusOut === null || (headOut === null && !/^## No commits yet/.test(statusOut))) return
    const head = (headOut ?? '').trim()
    const status = parseStatus(statusOut, root)
    const numstat = head
      ? await runGit($, root, ['diff', 'HEAD', '--numstat', '-z'])
      : await runGit($, root, ['diff', '--numstat', '-z'])
    applyNumstat(numstat ?? '', root, status.files)

    const byKey: CrewGit['files'] = {}
    for (const [path, f] of Object.entries(status.files)) byKey[keyOf(path, fold)] = f

    // Commits since the last look: their files turn green.
    const prev = await read($, git)
    // The HEAD kept for the next look: a commit whose files git could not list
    // this time stays new, and is booked on the next look instead of never.
    let seenHead = head
    // Only a HEAD that grew from the last one was committed to: a checkout, reset or
    // rebase moves it elsewhere, and its files are not this session's commits.
    const isCommit =
      Boolean(prev && prev.root === root && head && prev.head !== head) &&
      (!prev?.head || (await runGit($, root, ['merge-base', '--is-ancestor', prev.head, head])) !== null)
    if (prev && isCommit) {
      // After the repository's first commit, everything in its tree is new.
      const names = prev.head
        ? await runGit($, root, ['diff', '--name-only', '-z', prev.head, head])
        : await runGit($, root, ['ls-tree', '-r', '--name-only', '-z', head])
      if (names === null) seenHead = prev.head
      const committed = (names ?? '').split('\0').filter(Boolean).map(rel => `${root}/${rel}`)
      if (committed.length) {
        const at = await $.clock.now()
        const sha = head.slice(0, 7)
        await update($, files, list => {
          // Every file the tree knows takes the commit, however large it is (its
          // conflict and writes settle); new ones join up to the tree's bound.
          const out = [...(list ?? [])]
          const index = new Map(out.map((f, i) => [f.key, i]))
          let room = Math.max(0, MAX_FILES - out.length)
          for (const path of committed) {
            const key = keyOf(path, fold)
            const i = index.get(key) ?? -1
            if (i < 0 && room-- <= 0) continue
            const old: CrewFile = out[i] ?? { key, path, reads: 0, writes: 0, lastAt: at, lastKind: 'commit', agents: [] }
            const history = [...(old.history ?? []), { at, agent: 'git', kind: 'commit' as const }].slice(-MAX_HISTORY)
            const f: CrewFile = { ...old, lastAt: at, lastKind: 'commit', commit: sha, commitAt: at, history, conflict: undefined, recentWrites: undefined }
            if (i < 0) index.set(key, out.push(f) - 1)
            else out[i] = f
          }
          // The same bound as a read or write: the newest files stay.
          return out.length > MAX_FILES ? [...out].sort((a, b) => b.lastAt - a.lastAt).slice(0, MAX_FILES) : out
        })
        await update($, now, () => at)
      }
    }
    const next: CrewGit = { root, head: seenHead, ...status, files: byKey }
    if (JSON.stringify(prev) !== JSON.stringify(next)) await update($, git, () => next)
    // The open file's diff follows the tree, also when an edit leaves its
    // status and line counts as they were.
    const p = await readPanel($)
    if (p.openFile) await loadDiff($, p.openFile)
    // The "All" filter's list follows too: new and deleted files.
    if (p.fileFilter === 'all') await syncTree($)
  } finally {
    gitBusy = false
    if (gitQueued) {
      gitQueued = false
      $.clock.after(300, () => void syncGit($).catch(() => undefined))
    }
  }
}

// Every file under the root, for the tree's "All" filter: git's own list where
// there is a repository (tracked and untracked, what it ignores left out), else a
// walk that skips hidden folders and the usual build and dependency ones.
const MAX_TREE = 4000
const MAX_WALK_DEPTH = 6
/** Folders listed in one walk at most, however wide each level grows. */
const MAX_WALK_DIRS = 300
let treeBusy = false
let treeQueued = false
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'target', 'vendor', '__pycache__', 'venv'])

async function syncTree($: EngineInterface): Promise<void> {
  // One walk at a time; a refresh that comes while one runs is kept for one
  // more walk after it, so what changed meanwhile is not lost.
  if (treeBusy) {
    treeQueued = true
    return
  }
  treeBusy = true
  try {
    do {
      treeQueued = false
      await walkTree($)
    } while (treeQueued)
  } finally {
    treeBusy = false
  }
}

async function walkTree($: EngineInterface): Promise<void> {
  const g = await read($, git)
  const root = g?.root ?? posix(await $.session.cwd())
  let paths: string[] = []
  if (g) {
    const out = await runGit($, root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    paths = (out ?? '').split('\0').filter(Boolean).slice(0, MAX_TREE).map(rel => `${root}/${rel}`)
  } else {
    let level = [root]
    let listed = 0
    for (let depth = 0; depth < MAX_WALK_DEPTH && level.length && paths.length < MAX_TREE && listed < MAX_WALK_DIRS; depth++) {
      const next: string[] = []
      for (const dir of level) {
        if (listed++ >= MAX_WALK_DIRS || paths.length >= MAX_TREE) break
        let entries: Awaited<ReturnType<EngineInterface['fs']['list']>> = []
        try {
          entries = await $.fs.list(dir)
        } catch {
          continue
        }
        for (const e of entries) {
          if (e.kind === 'dir' && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name)) {
            // The queue need never hold more than the walk can still list.
            if (next.length < MAX_WALK_DIRS) next.push(`${dir}/${e.name}`)
          }
          else if (e.kind === 'file' && paths.length < MAX_TREE) paths.push(`${dir}/${e.name}`)
        }
      }
      level = next
    }
  }
  const next = { root, paths }
  if (JSON.stringify(await read($, tree)) !== JSON.stringify(next)) await update($, tree, () => next)
}

// Writes and commands settle a moment before git sees them.
const queueGit = ($: EngineInterface) => {
  $.clock.after(500, () => void syncGit($).catch(() => undefined))
}

// savvy-progress's tool through which a worker reports its own steps. The mod
// only listens: a tool of its own would cost every request tokens.
const STEP_TOOL = 'mcp__savvy-progress__step'

// A report merges into the last one as savvy-progress merges it: a count left
// out stays, the note is the current step's and goes with it.
const stepReport =
  (input: Loose) =>
  (prev: CrewRun['report']): CrewRun['report'] => {
    const num = (x: unknown, keep: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.round(x)) : keep)
    const total = num(input.total, prev?.total ?? 0)
    const done = num(input.done, prev?.done ?? 0)
    const note = typeof input.note === 'string' ? oneLine(input.note, 80) || undefined : undefined
    return { done: total ? Math.min(total, done) : done, total, ...(note ? { note } : {}) }
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
    // A progress report is no action of its own: it fills the bar instead.
    const report = tool === STEP_TOOL && isOk ? stepReport(input) : undefined
    await update($, runs, list =>
      list.map(r =>
        r.agentId !== agentId ? r : report ? { ...r, report: report(r.report) } : tool === STEP_TOOL ? r : { ...r, lastAction: oneLine(line, 140) },
      ),
    )
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

// The pane opens by itself once a session: on the first subagent (`autoOpen`),
// or on the first file read or changed (`autoOpenFiles`), whichever comes first.
async function autoOpenPane($: EngineInterface, cause: 'agents' | 'files'): Promise<void> {
  if ((cause === 'agents' ? opts.autoOpen : opts.autoOpenFiles) === false) return
  if ((await readPanel($)).hasAutoOpened) return
  await setPanel($, () => ({ hasAutoOpened: true }))
  if ((await $.ui.panes()).some(p => p.id === PANE)) return
  void $.ui.open({ id: PANE, title: tr().pane }).catch(() => undefined)
  void syncGit($).catch(() => undefined)
}

// --- updates: the published plugin.json on GitHub against this copy's own, at
// most once a day; a notice once per new version; installed from the settings.

const PLUGIN_ID = 'agent-crew@agent-crew'
const CHECK_EVERY_MS = 24 * 3_600_000
/** After a failed look (offline, an error, a page that is not a manifest), the next one comes sooner. */
const RETRY_AFTER_MS = 30 * 60_000

async function manifest($: EngineInterface): Promise<{ version: string; repository: string }> {
  try {
    const m = JSON.parse(String(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`))) as { version?: unknown; repository?: unknown }
    return { version: typeof m.version === 'string' ? m.version : '0.0.0', repository: typeof m.repository === 'string' ? m.repository : '' }
  } catch {
    return { version: '0.0.0', repository: '' }
  }
}

// `force`: look now, whatever the day; `isOffline`: only note this copy's version.
// One look at a time: a second call (the button again, the hourly tick) waits for
// the one under way instead of racing it with an older snapshot of the store.
// A forced look that meets a lesser one under way (offline, or not yet due) does
// not just wait for it: it runs after it.
let checkFlight: Promise<void> | undefined
let isFlightForced = false
function checkUpdate($: EngineInterface, force = false, isOffline = false): Promise<void> {
  const isForced = force && !isOffline
  if (checkFlight && (!isForced || isFlightForced)) return checkFlight
  const before = checkFlight ?? Promise.resolve()
  isFlightForced = isForced
  const flight: Promise<void> = before
    .catch(() => undefined)
    .then(() => lookForUpdate($, force, isOffline))
    .finally(() => {
      if (checkFlight === flight) {
        checkFlight = undefined
        isFlightForced = false
      }
    })
  checkFlight = flight
  return flight
}

async function lookForUpdate($: EngineInterface, force: boolean, isOffline: boolean): Promise<void> {
  const own = await manifest($)
  const root = posix($.plugin.root)
  // An installed copy lives in the plugin cache; anything else is a folder of its own.
  const source = /\/\.claude\/plugins\/cache\//i.test(root) ? 'marketplace' : 'folder'
  const prev = await read($, updateInfo)
  const base: CrewUpdate = { current: own.version, source, root, latest: prev?.latest }
  const saved = (await $.store.get('update')) as { checkedAt?: number; failedAt?: number; latest?: string; notified?: string } | undefined
  const at = await $.clock.now()
  let latest = saved?.latest
  const isDue = (!saved?.checkedAt || at - saved.checkedAt > CHECK_EVERY_MS) && (!saved?.failedAt || at - saved.failedAt > RETRY_AFTER_MS)
  if (!isOffline && (force || isDue)) {
    await update($, updateInfo, (): CrewUpdate => ({ ...base, phase: 'checking' }))
    const url = rawGithubUrl(own.repository, 'plugins/agent-crew/.claude-plugin/plugin.json')
    let found: string | undefined
    try {
      const r = url ? await $.http.fetch(url) : undefined
      const v = r?.ok ? (JSON.parse(r.text) as { version?: unknown }).version : undefined
      if (typeof v === 'string' && /^\d+\.\d+/.test(v)) found = v
    } catch {
      // Offline, refused or not a manifest: keep what was known.
    }
    // Only a valid answer counts as the day's look; a failure is tried again within the hour.
    if (found) {
      latest = found
      await $.store.set('update', { ...((await $.store.get('update')) as object), checkedAt: at, failedAt: undefined, latest })
    } else await $.store.set('update', { ...((await $.store.get('update')) as object), failedAt: at })
  }
  await update($, updateInfo, () => ({ ...base, latest }))
  if (opts.checkUpdates !== false && latest && isNewer(latest, own.version) && saved?.notified !== latest) {
    await $.store.set('update', { ...((await $.store.get('update')) as object), notified: latest })
    await notify($, tr().updateAvailable(latest))
  }
}

// `claude plugin update` after the marketplace is fetched again, then a reload.
let isUpdating = false
async function runUpdate($: EngineInterface): Promise<void> {
  const cur = await read($, updateInfo)
  if (!cur || cur.source !== 'marketplace' || isUpdating) return
  isUpdating = true
  try {
    await installUpdate($, cur)
  } finally {
    isUpdating = false
  }
}

async function installUpdate($: EngineInterface, cur: CrewUpdate): Promise<void> {
  await update($, updateInfo, (): CrewUpdate => ({ ...cur, phase: 'updating', error: undefined }))
  const run = async (argv: string[]) => {
    try {
      const r = await $.process.run(argv, { timeoutMs: 120_000 })
      return r.exitCode === 0 ? '' : r.stderr.trim().split('\n')[0] || `exit ${r.exitCode}`
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  }
  const error = (await run(['claude', 'plugin', 'marketplace', 'update', 'agent-crew'])) || (await run(['claude', 'plugin', 'update', PLUGIN_ID]))
  if (error) {
    await update($, updateInfo, (): CrewUpdate => ({ ...cur, phase: 'failed', error }))
    $.ui.toast(tr().updateFailed(error))
    return
  }
  await update($, updateInfo, (): CrewUpdate => ({ ...cur, phase: 'done' }))
  $.ui.toast(tr().updateDone(cur.latest ?? ''))
  // The new copy loads with the plugins: a dispatch of its own, after the toast.
  $.clock.after(800, () => void $.command.run({ command: 'reload-plugins' }).catch(() => undefined))
}

// `/crew`: shuts the pane the person sees; one that is open but out of sight
// (a tab behind another, or waiting unplaced) comes into view instead.
async function togglePane($: EngineInterface): Promise<boolean> {
  const pane = (await $.ui.panes()).find(p => p.id === PANE)
  if (pane?.isShown && pane.isPlaced) {
    await $.ui.close({ id: PANE })
    return false
  }
  await showPane($)
  return true
}

// Brings the pane into view. Opening an open id only retitles it, and `focus`,
// which would raise it, is refused while the band or a pane holds the keys, as
// right after a click on the band: a pane out of sight is shut and opened anew,
// and a new pane is shown. Called in the answer to the person's input, never
// later, so the host counts the open as asked for and places it at any width.
async function showPane($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  await update($, now, () => at)
  const pane = (await $.ui.panes()).find(p => p.id === PANE)
  if (pane && !(pane.isShown && pane.isPlaced)) await $.ui.close({ id: PANE })
  await $.ui.open({ id: PANE, title: tr().pane, focus: true })
  void syncGit($).catch(() => undefined)
}

const kindOf = (e: { fork: boolean; isTeammate?: true; workflow?: unknown }): CrewKind =>
  e.workflow ? 'workflow' : e.isTeammate ? 'teammate' : e.fork ? 'fork' : 'agent'

// --- desktop drawings.

const STATUS_GLYPH: Record<CrewStatus, string> = { running: '●', idle: '○', done: '✓', failed: '✗', stopped: '■' }

const statusMark = (x: number, y: number, status: CrewStatus, color: string): string => {
  if (status === 'running') return `<circle cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`
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

// The status mark sits beside the row's picture, not in it: a running agent's
// dot pulses, and only a Client keeps a pulse through the pane's redraws.
const MARK_W = 22

const runMarkSvg = (r: CrewRun): string => svg(MARK_W, ROW_H, statusMark(MARK_W - 8, 16, r.status, colorOf(r)), false)

const runSvg = (W: number, r: CrewRun, depth: number, byId: Map<string, CrewRun>, at: number, isViewed: boolean): string => {
  const color = colorOf(r)
  const ctx = ctxOf(r)
  const x0 = depth * INDENT
  const tx = x0 + 42
  // Deep nesting in a narrow pane leaves no room: never a negative width.
  const textW = Math.max(0, W - tx)
  const stats = `ctx ${ctx}% · ${fmtTokens(r.contextTokens)}  ≈${fmtCost(r.costUsd)}  ${fmtTime(elapsed(r, at))}`
  const b = barOf(r, at)
  // The row is drawn anew several times a second while it runs, each time
  // starting its animations over (svg-redraw-restarts-animation). So the bar
  // glides from where it stands now towards where it will stand a second on:
  // each redraw picks the glide up at the right width, and a step's jump shows
  // as one (names are the run's own, since the rows may share one document).
  const w = Math.round(textW * b.share)
  const next = r.status === 'running' ? Math.round(textW * barOf(r, at + 1000).share) : w
  const id = r.id.replace(/[^A-Za-z0-9]/g, '')
  const glide =
    next > w
      ? `<style>.gr${id}{transform-box:fill-box;transform-origin:left;animation:gr${id} 1s linear forwards}@keyframes gr${id}{from{transform:scaleX(${(w / next).toFixed(4)})}}@media (prefers-reduced-motion: reduce){.gr${id}{animation:none}}</style>`
      : ''
  const barBody = `${glide}<rect${glide ? ` class="gr${id}"` : ''} x="${tx}" y="68" width="${Math.max(w, next)}" height="4" rx="2" fill="${b.color}" opacity="${isActive(r) ? 0.75 : 1}"/>`
  const statsW = textWidth(stats, 11)
  const reportText = b.label ? `<text class="s" x="${tx}" y="64" font-family="${FONT}" font-size="11">${xml(fitText(b.label, 11, Math.max(0, textW - statsW - 12)))}</text>` : ''
  const tree = depth ? `<path class="tree" d="M${x0 - INDENT / 2} 0V${ROW_H / 2 - 4}h${INDENT / 2 - 2}" fill="none" stroke-width="1.2"/>` : ''
  const last = r.lastAction ? `› ${r.lastAction}` : ''
  return svg(
    W,
    ROW_H,
    `${isViewed ? `<rect x="0" y="2" width="3" height="${ROW_H - 6}" rx="1.5" fill="${color}"/>` : ''}${tree}
${crab(x0 + (isViewed ? 4 : 0), 14, costumeOf(r), color, r.status === 'stopped', r.status === 'running', 1.1, flipAt(at))}
<text class="t" x="${tx}" y="18" font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(r.description || typeLabel(r), 13, textW))}</text>
<text x="${tx}" y="34" font-family="${FONT}" font-size="11"><tspan fill="${color}">${xml(fitText(typeLabel(r), 11, textW * 0.4))}</tspan><tspan class="s">  ${xml(fitText(metaOf(r, byId).join('  ·  '), 11, textW * 0.6))}</tspan></text>
<text class="m" x="${tx}" y="50" font-family="${FONT}" font-size="11">${xml(fitText(last, 11, textW))}</text>
<text class="s" x="${tx + textW}" y="64" text-anchor="end" font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${stats}</text>
${reportText}
<rect class="k" x="${tx}" y="68" width="${textW}" height="4" rx="2"/>${barBody}`,
  )
}

const COMPACT_ROW = 36
const COMPACT_LABEL = 92

// Compact: one labelled row of crabs for the active, one for the finished. The
// active walk, with a live dot; the finished stand dimmed, a status badge on each.
const compactSvg = (W: number, active: CrewRun[], done: CrewRun[], t: ReturnType<typeof totals> | null, at?: number): { source: string; height: number } => {
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
            ? `<circle cx="${x + 32}" cy="${y + 4}" r="3" fill="${colorOf(r)}"/>`
            : `<circle cx="${x + 32}" cy="${y + 4}" r="3" fill="none" stroke="${colorOf(r)}" stroke-width="1.4"/>`
          : r.status === 'done'
            ? `<circle cx="${x + 31}" cy="${y + 5}" r="5" fill="#3B9C5F"/><path d="M${x + 28.5} ${y + 5}l1.8 1.8 3.2-3.4" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`
            : r.status === 'failed'
              ? `<circle cx="${x + 31}" cy="${y + 5}" r="5" fill="#D0453F"/><path d="M${x + 29} ${y + 3}l4 4M${x + 33} ${y + 3}l-4 4" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>`
              : `<circle cx="${x + 31}" cy="${y + 5}" r="5" fill="#9a9a96"/><rect x="${x + 29.2}" y="${y + 3.2}" width="3.6" height="3.6" fill="#fff"/>`
        return crab(x, y, costumeOf(r), colorOf(r), isDone, r.status === 'running', 1.1, at === undefined ? undefined : flipAt(at)) + badge
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
const timelineAxis = (items: CrewRun[], at: number, width: number, wantGapW: number) => {
  const spans = items.map(r => [r.startedAt, r.endedAt ?? at] as const).sort((a, b) => a[0] - b[0])
  const clusters: { from: number; to: number }[] = []
  for (const [s0, s1] of spans) {
    const last = clusters.at(-1)
    if (last && s0 <= last.to + TL_GAP_MS) last.to = Math.max(last.to, s1)
    else clusters.push({ from: s0, to: s1 })
  }
  const busy = Math.max(1000, clusters.reduce((sum, c) => sum + (c.to - c.from), 0))
  // The breaks together take at most 40 % of the axis: many pauses get narrower ones.
  const gapW = clusters.length > 1 ? Math.min(wantGapW, (width * 0.4) / (clusters.length - 1)) : wantGapW
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
  return { xOf, breaks, gapW, total: (clusters.at(-1)?.to ?? at) - (clusters[0]?.from ?? at) }
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
        `<rect x="${x}" y="${y + 4}" width="${w}" height="7" rx="3.5" fill="${color}" opacity="${r.status === 'stopped' ? 0.45 : 0.9}"/>`
      )
    })
    .join('')
  const axisY = items.length * TL_ROW + 12
  // A break: two slanted strokes across the rows, the pause written under them.
  const breaks = axis.breaks
    .map(b => {
      const cx = barX + b.x + axis.gapW / 2
      const half = Math.min(4, axis.gapW / 2)
      return (
        `<path class="tree" d="M${cx - half} ${items.length * TL_ROW + 2}L${cx - half / 4} 0M${cx + half / 4} ${items.length * TL_ROW + 2}L${cx + half} 0" fill="none" stroke-width="1.2"/>` +
        // The pause's length only where its break leaves the label room.
        (axis.gapW >= 18 ? `<text class="m" x="${cx}" y="${axisY}" text-anchor="middle" font-family="${FONT}" font-size="9.5">+${fmtTime(b.pause)}</text>` : '')
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

// The option that shows a meter: the context, the 5-hour window, or a weekly one.
const meterOption = (key: string): string =>
  key === 'context' ? 'usageContext' : /five|5h/i.test(key) ? 'usageFiveHour' : 'usageWeek'

// Blue while there is room, amber from 80 %, red from 95 %.
const meterColor = (percent: number): string => (percent >= 95 ? '#D0453F' : percent >= 80 ? '#BA7517' : '#378ADD')

// The time until a reset, `1h 20m`; empty once it has passed or can't be read.
const spanTo = (iso: string, at: number): string => {
  const when = Date.parse(iso)
  if (!Number.isFinite(when)) return ''
  const ms = when - at
  if (ms <= 0) return ''
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m}m` : `${m}m`
}

const resetIn = (iso: string, at: number): string => {
  const span = spanTo(iso, at)
  return span ? tr().resets(span) : ''
}

// --- the band above the prompt: a line for each part its options keep, each
// line a click region (hotspot.tsx) that opens the pane.

const BAND_AGENTS = 4

type BandLine = { kind: 'crew' | 'progress' | 'usage'; segs: HotSeg[] }

/** One count of the band's crew line: its sign and colour, and its words. */
type CrewCount = { sign: string; color?: string; text: string; isDim?: boolean; isRunning?: boolean }

// The crew by state, in the pane's order, then conflicts. The first count names
// the subagents, so a band of finished or stopped ones still says what it counts.
// Conflicts stay after the agents are cleared: they belong to the files.
const crewCounts = (list: CrewRun[], fileList: CrewFile[]): CrewCount[] => {
  const s = tr()
  const by = (status: CrewStatus) => list.filter(r => r.status === status).length
  const out: CrewCount[] = []
  const add = (n: number, count: Omit<CrewCount, 'text'>, alone: (n: number) => string, after: (n: number) => string) => {
    if (n) out.push({ ...count, text: out.length ? after(n) : alone(n) })
  }
  add(by('running'), { sign: '●', isRunning: true }, s.statusRunning, s.statusRunning)
  add(by('idle'), { sign: '○ ', color: CLAY }, s.bandIdleAgents, s.bandIdle)
  add(by('done'), { sign: '✓ ', color: COMMIT_COLOR, isDim: true }, s.bandDoneAgents, s.bandDone)
  add(by('stopped'), { sign: '■ ', color: '#9a9a96', isDim: true }, s.bandStoppedAgents, s.bandStopped)
  add(by('failed'), { sign: '✗ ', color: '#D0453F' }, s.bandFailedAgents, s.bandFailed)
  const conflicts = fileList.filter(f => (f.conflict?.length ?? 0) > 1).length
  if (conflicts) out.push({ sign: '⚠ ', color: '#D0453F', text: s.bandConflicts(conflicts) })
  return out
}

const bandLines = (list: CrewRun[], fileList: CrewFile[], u: CrewUsage, at: number): BandLine[] => {
  const s = tr()
  const lines: BandLine[] = []
  const sep: HotSeg = { t: '  ·  ', dim: true }
  const join = (parts: HotSeg[][]): HotSeg[] => parts.flatMap((p, i) => (i ? [sep, ...p] : p))
  const running = list.filter(r => r.status === 'running')
  // The crew: every state that has agents, and conflicts; nothing while there is neither.
  const counts = opts.bandAgents !== false ? crewCounts(list, fileList) : []
  if (counts.length) {
    // A pulsing dot in each running agent's colour, where a picture would show its crab.
    const dots = running.slice(0, 8).map((r): HotSeg => ({ t: '●', c: colorOf(r), pulse: true }))
    const parts = counts.map((n): HotSeg[] => [...(n.isRunning ? [...dots, { t: ' ' }] : [{ t: n.sign, c: n.color }]), { t: n.text, dim: n.isDim }])
    lines.push({ kind: 'crew', segs: join(parts) })
  }
  // Progress: each running agent with a short bar, as its row in the pane has it.
  if (opts.bandProgress === true && running.length) {
    const shown = running.slice(0, BAND_AGENTS)
    const parts = shown.map((r): HotSeg[] => {
      const b = barOf(r, at)
      return [{ t: `${oneLine(r.description || typeLabel(r), 18)} `, c: colorOf(r) }, { t: cellBar(b.share, 6), c: b.color }]
    })
    const more = running.length - shown.length
    lines.push({ kind: 'progress', segs: [...join(parts), ...(more ? [{ t: `  +${more}`, dim: true }] : [])] })
  }
  // Usage: the meters the usage options keep, coloured from 80 %, a limit with its reset.
  if (opts.bandUsage === true) {
    const parts = metersOf(u)
      .filter(m => opts[meterOption(m.key)] !== false)
      .map((m): HotSeg[] => {
        const span = m.resetsAt ? spanTo(m.resetsAt, at) : ''
        return [
          { t: `${m.label} `, dim: true },
          { t: `${cellBar(m.percent / 100, 6)} `, c: meterColor(m.percent) },
          { t: `${m.percent}%`, c: m.percent >= 80 ? meterColor(m.percent) : undefined, b: m.percent >= 80 },
          ...(span ? [{ t: ` (${span})`, dim: true }] : []),
        ]
      })
    if (parts.length) lines.push({ kind: 'usage', segs: join(parts) })
  }
  return lines
}

// The band's crew on the desktop: a walking crab for each running agent (with
// its name and bar beside it, by `bandProgress`), then the counts (by
// `bandAgents`). The crabs walk as the pane's do, a flip book (crab-flip-book).
const BAND_CREW_H = 32
// Room the /compact button takes beside the usage rings, in CSS px.
const COMPACT_W = 96

const bandCrewSvg = (W: number, list: CrewRun[], fileList: CrewFile[], at: number): string => {
  const running = list.filter(r => r.status === 'running')
  const withBars = opts.bandProgress === true
  // The counts come first and fit the band: in words while they fit, else as
  // signs and numbers (`● 2 · ✓ 3`), else the last ones give way to `…`. Crabs
  // only where room is left beside them, and their `+n` only beside a crab, as
  // the counts already say how many run.
  const SEP = '  ·  '
  const all = opts.bandAgents !== false ? crewCounts(list, fileList) : []
  const short = (n: CrewCount) => `${n.isRunning ? '● ' : n.sign}${/\d+/.exec(n.text)?.[0] ?? ''}`
  const long = (n: CrewCount) => (n.isRunning ? '' : n.sign) + n.text
  const widthOf = (ns: CrewCount[], form: (n: CrewCount) => string, cut: boolean) =>
    ns.length ? textWidth(ns.map(form).join(SEP) + (cut ? `${SEP}…` : ''), 12.5) : 0
  const room = W - 4
  const isShort = widthOf(all, long, false) > room
  const form = isShort ? short : long
  let counts = all
  while (counts.length > 1 && widthOf(counts, form, counts.length < all.length) > room) counts = counts.slice(0, -1)
  const isCut = counts.length < all.length
  const countsW = counts.length ? widthOf(counts, form, isCut) + 8 : 0
  const slot = withBars ? 180 : 30
  const fit = Math.max(0, Math.floor((W - countsW - 32) / slot))
  const shown = running.slice(0, fit)
  const crabs = shown
    .map((r, i) => {
      const x = i * slot
      const body = crab(x, 3, costumeOf(r), colorOf(r), false, true, 0.85, flipAt(at))
      if (!withBars) return body
      const b = barOf(r, at)
      const bx = x + 32
      const bw = slot - 44
      return (
        body +
        `<text class="t" x="${bx}" y="14" font-family="${FONT}" font-size="11.5">${xml(fitText(r.description || typeLabel(r), 11.5, bw))}</text>` +
        `<rect class="k" x="${bx}" y="21" width="${bw}" height="4" rx="2"/><rect x="${bx}" y="21" width="${Math.round(bw * b.share)}" height="4" rx="2" fill="${b.color}" opacity=".75"/>`
      )
    })
    .join('')
  let x = shown.length * slot + (shown.length ? 4 : 0)
  const more = shown.length ? running.length - shown.length : 0
  const moreText = more ? `<text class="s" x="${x}" y="20" font-family="${FONT}" font-size="12">+${more}</text>` : ''
  if (more) x += 28
  const parts = counts.map(n => {
    const words = isShort ? short(n).slice(n.isRunning ? 2 : n.sign.length) : n.text
    if (n.isRunning) return `${isShort ? `<tspan fill="${CLAY}">● </tspan>` : ''}<tspan class="t" font-weight="600">${xml(words)}</tspan>`
    return `<tspan fill="${n.color ?? '#9a9a96'}">${xml(n.sign)}</tspan><tspan class="${n.isDim ? 's' : 't'}">${xml(words)}</tspan>`
  })
  if (isCut) parts.push('<tspan class="m">…</tspan>')
  const countsText = parts.length
    ? `<text x="${x}" y="20" font-family="${FONT}" font-size="12.5">${parts.join(`<tspan class="m">${SEP}</tspan>`)}</text>`
    : ''
  return svg(W, BAND_CREW_H, crabs + moreText + countsText)
}

// What `next(e)` resolves to where nothing beneath draws: the engine's own.
const isEngineOwn = (x: unknown): boolean => Boolean(x && typeof x === 'object' && (x as { type?: unknown }).type === 'engine')

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
  /** An untouched file's path, from the "All" filter's list. */
  path?: string
}

const UNTOUCHED_COLOR = '#8a8a86'

const isChanged = (v: FileView): boolean => Boolean(v.gitFile || (v.file && (v.file.writes > 0 || v.file.commit)))

/** Gone from the working tree, as git sees it: drawn as a red ✗. */
const isDeleted = (v: FileView): boolean => Boolean(v.gitFile && !v.gitFile.code.includes('?') && v.gitFile.code.includes('D'))

/** Not in the last commit yet, untracked or staged as added: drawn as a blue +. */
const isNew = (v: FileView): boolean => Boolean(v.gitFile && !isDeleted(v) && (v.gitFile.code.includes('?') || v.gitFile.code.startsWith('A')))

const fileColor = (v: FileView): string => {
  if (!v.file && !v.gitFile) return UNTOUCHED_COLOR
  if (isDeleted(v)) return DELETE_COLOR
  if (isNew(v)) return NEW_COLOR
  if (v.gitFile || v.file?.lastKind === 'write') return WRITE_COLOR
  if (v.file?.commit) return COMMIT_COLOR
  return READ_COLOR
}

const fileGlyph = (v: FileView): string => {
  if (!v.file && !v.gitFile) return '·'
  if (isDeleted(v)) return '✗'
  if (isNew(v)) return '+'
  if (v.gitFile || v.file?.lastKind === 'write') return '✎'
  if (v.file?.commit) return '✓'
  return '◉'
}

const gitBadge = (v: FileView): string => {
  const g = v.gitFile
  if (!g) return v.file?.commit ? `✓ ${v.file.commit}` : ''
  if (isDeleted(v)) return tr().isDeleted
  if (isNew(v)) return tr().isNew
  return g.add || g.del ? `+${g.add} −${g.del}` : g.code.trim()
}

const badgeColor = (v: FileView): string => (isDeleted(v) ? DELETE_COLOR : isNew(v) ? NEW_COLOR : v.gitFile ? WRITE_COLOR : COMMIT_COLOR)

// The tree's files by its filter: `activity`, what the session's agents read and
// changed (and what git reports as changed); `changed`, the changes alone;
// `all`, every file under the root besides, untouched ones drawn quiet.
const fileViews = (list: CrewFile[], g: CrewGit | null, base: string, filter: CrewPanel['fileFilter'], everyPath: readonly string[] = []): FileView[] => {
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
  if (filter === 'all') {
    for (const path of everyPath) {
      const key = keyOf(path, fold)
      if (!map.has(key)) map.set(key, { key, label: label(path), path })
    }
  }
  const out = [...map.values()]
  return filter === 'changed' ? out.filter(isChanged) : out
}

const isUntouched = (v: FileView): boolean => !v.file && !v.gitFile

// What a shut folder shows of the files inside it: a count per sign, in the
// colours of the legend, conflicts after them, then the agents' dots. Untouched
// files (the All filter's) count for nothing. With an agent in focus, a folder
// it has no file in goes dim, as its file rows would.
const FOLDER_SIGNS = [
  ['✎', WRITE_COLOR],
  ['+', NEW_COLOR],
  ['✗', DELETE_COLOR],
  ['✓', COMMIT_COLOR],
  ['◉', READ_COLOR],
] as const

const folderSummary = (inside: FileView[], byAgent: Map<string, CrewRun>, focus?: string): Seg[] => {
  const counts = new Map<string, number>()
  const agents = new Set<string>()
  let conflicts = 0
  for (const v of inside) {
    if (isUntouched(v)) continue
    const sign = fileGlyph(v)
    counts.set(sign, (counts.get(sign) ?? 0) + 1)
    if ((v.file?.conflict?.length ?? 0) > 1) conflicts++
    for (const a of v.file?.agents ?? []) agents.add(a)
  }
  const isDim = Boolean(focus && !agents.has(focus))
  const out: Seg[] = FOLDER_SIGNS.flatMap(([sign, c]) => (counts.get(sign) ? [{ t: `${sign}${counts.get(sign)} `, c, dim: isDim }] : []))
  if (conflicts) out.push({ t: `⚠${conflicts} `, c: '#D0453F' })
  for (const a of [...agents].slice(0, 6)) out.push({ t: '●', c: agentColor(a, byAgent), dim: isDim })
  // As wide as a file row's ` ▸ `, so the signs stand in line with theirs.
  if (out.length) out.push({ t: agents.size ? '   ' : '  ' })
  return out
}

const MAX_FILE_ROWS = 80

// A Client's props are plain data: a segment carries only the fields it sets.
const plainSeg = (s: Seg): Seg => Object.fromEntries(Object.entries(s).filter(([, x]) => x !== undefined && x !== false)) as Seg
const plainHot = (s: HotSeg): HotSeg => Object.fromEntries(Object.entries(s).filter(([, x]) => x !== undefined && x !== false)) as HotSeg

// The shimmer's tones, after filetree's (Kurt Buhler, MIT): the base colour, then
// three steps lighter for the band's edge, shoulder and crest. A deleted file
// shimmers red and a new one blue, whatever its last touch was.
const SHIMMER: Record<CrewFile['lastKind'] | 'delete' | 'new', string[]> = {
  read: ['#a855f7', '#c084fc', '#d8b4fe', '#f3e8ff'],
  write: ['#f97316', '#fb923c', '#fdba74', '#ffedd5'],
  commit: ['#22c55e', '#4ade80', '#86efac', '#dcfce7'],
  delete: ['#ef4444', '#f87171', '#fca5a5', '#fee2e2'],
  new: ['#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe'],
}

// A double press on a file opens it, as in filetree; a single one its card.
const DOUBLE_MS = 450
let lastPress = { key: '', at: 0 }
let osName: 'linux' | 'darwin' | 'win32' | undefined

async function openFile($: EngineInterface, path: string): Promise<void> {
  if (!osName) {
    if (fold) osName = 'win32'
    else {
      try {
        osName = (await $.process.run(['uname', '-s'], { timeoutMs: 3_000 })).stdout.trim() === 'Darwin' ? 'darwin' : 'linux'
      } catch {
        osName = 'linux'
      }
    }
  }
  const { argv, env } = openCommand(osName, path)
  try {
    const r = await $.process.run(argv, { timeoutMs: 10_000, ...(env ? { env } : {}) })
    if (r.exitCode !== 0) $.ui.toast(tr().openFailed(path.split('/').pop() ?? path))
  } catch {
    $.ui.toast(tr().openFailed(path.split('/').pop() ?? path))
  }
}

async function blurSearch($: EngineInterface): Promise<void> {
  if ((await readPanel($)).isSearchFocused) await setPanel($, () => ({ isSearchFocused: false }))
}

// Enter in the search line: the first file the query matches, its card open.
async function openFirstHit($: EngineInterface, text: string): Promise<void> {
  const q = text.trim().toLowerCase()
  if (!q) return
  const g = await read($, git)
  const p = await readPanel($)
  const root = p.fileRoot ?? ''
  const views = underFolder(fileViews(await read($, files), g, g?.root ?? posix(await $.session.cwd()), p.fileFilter, (await read($, tree))?.paths), root, fold)
  const hit = treeRows(views.filter(v => v.label.toLowerCase().includes(q)).map(v => ({ key: v.key, label: v.label })), fold).find(r => !r.isDir)
  if (!hit) return
  // Its folders open with it, so the card stays in sight once the query is cleared.
  const label = views.find(v => v.key === hit.key)?.label ?? ''
  await setPanel($, q => ({ openFile: hit.key, fileQuery: text, openDirs: [...new Set([...(q.openDirs ?? []), ...folderKeys(label, root, fold)])] }))
  await loadDiff($, hit.key)
}

// The card (history and diff) of one file, open or shut.
async function toggleCard($: EngineInterface, key: string): Promise<void> {
  const opening = (await readPanel($)).openFile !== key
  await setPanel($, () => ({ openFile: opening ? key : undefined }))
  if (opening) await loadDiff($, key)
}

// A press on a row of the tree: a folder shuts or opens, a file its card. A
// second press on the same row soon after enters the folder (the breadcrumbs
// lead back) or opens the file itself.
// `isShown`: whether the row was drawn open, also when only a fresh file opened it.
async function pressRow($: EngineInterface, id: string, isShown?: boolean): Promise<void> {
  const at = await $.clock.now()
  const isDouble = lastPress.key === id && at - lastPress.at < DOUBLE_MS
  lastPress = { key: isDouble ? '' : id, at }
  if (id.startsWith('dir:')) {
    await setPanel($, q => {
      const open = q.openDirs ?? []
      const shutAt = { ...(q.shutAt ?? {}) }
      // The first press of the two opened the folder: entering it closes it again.
      if (isDouble) return { fileRoot: folderOf(id), openDirs: open.filter(k => k !== id), openFile: undefined }
      // Shown open (by a press, or a file that shimmers in it): shut it, and keep it
      // shut against what was touched before this press.
      if (isShown ?? open.includes(id)) {
        shutAt[id] = at
        return { openDirs: open.filter(k => k !== id), shutAt: Object.fromEntries(Object.entries(shutAt).slice(-200)) }
      }
      delete shutAt[id]
      return { openDirs: [...open, id].slice(-500), shutAt }
    })
    return
  }
  if (!isDouble) {
    await toggleCard($, id)
    return
  }
  const path =
    (await read($, files)).find(f => f.key === id)?.path ?? (await read($, git))?.files[id]?.path ?? (await read($, tree))?.paths.find(x => keyOf(x, fold) === id)
  if (path) await openFile($, path)
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

type Group = 'sections' | 'usage' | 'band' | 'view' | 'notify'
type Field = { key: string; group: Group; default: boolean | string; choices?: readonly string[] }

const GROUPS: readonly Group[] = ['sections', 'usage', 'band', 'view', 'notify']

const FIELDS: readonly Field[] = [
  { key: 'showUsage', group: 'sections', default: true },
  { key: 'showTotals', group: 'sections', default: false },
  { key: 'showAgents', group: 'sections', default: true },
  { key: 'showTimeline', group: 'sections', default: true },
  { key: 'showFiles', group: 'sections', default: true },
  { key: 'usageContext', group: 'usage', default: true },
  { key: 'usageFiveHour', group: 'usage', default: true },
  { key: 'usageWeek', group: 'usage', default: true },
  { key: 'bandAgents', group: 'band', default: true },
  { key: 'bandProgress', group: 'band', default: false },
  { key: 'bandUsage', group: 'band', default: false },
  { key: 'statusLine', group: 'band', default: true },
  { key: 'autoOpen', group: 'view', default: true },
  { key: 'autoOpenFiles', group: 'view', default: true },
  { key: 'language', group: 'view', default: 'auto', choices: ['auto', 'de', 'en'] },
  { key: 'crabMotion', group: 'view', default: 'smooth', choices: ['smooth', 'light'] },
  { key: 'notifyAgents', group: 'notify', default: 'background', choices: ['off', 'failures', 'background', 'all'] },
  { key: 'notifyVia', group: 'notify', default: 'toast', choices: ['toast', 'system'] },
  { key: 'limitWarnings', group: 'notify', default: true },
  { key: 'warnConflicts', group: 'notify', default: true },
  { key: 'checkUpdates', group: 'notify', default: true },
]

const FIELD_TEXT = {
  de: {
    title: 'Crew · Einstellungen',
    groups: { sections: 'Abschnitte', usage: 'Nutzung', band: 'Über dem Prompt', view: 'Allgemein', notify: 'Benachrichtigungen' } as Record<Group, string>,
    version: 'Version',
    upToDate: 'Aktuell',
    available: (v: string) => `${v} verfügbar`,
    checking: 'Wird geprüft …',
    checkNow: 'Nach Updates suchen',
    updateTo: (v: string) => `Auf ${v} aktualisieren`,
    updating: 'Wird aktualisiert …',
    updated: 'Installiert, die Plugins laden neu.',
    fromFolder: (root: string) => `Aus einem Ordner geladen (${root}): dort mit git pull aktualisieren.`,
    on: 'An',
    off: 'Aus',
    locked: 'Vom Administrator festgelegt',
    footer: 'Dieselben Werte wie in /config. Änderungen gelten sofort.',
    opened: 'Crew-Einstellungen geöffnet.',
    open: 'Einstellungen',
    fields: {
      showUsage: ['Nutzung', 'Kontext und Limits oben im Panel; welche, legt die Gruppe Nutzung fest'],
      showTotals: ['Kosten', 'Hauptchat und Subagenten getrennt, mit Tokens und Gesamtsumme'],
      showAgents: ['Subagenten', 'Laufende und fertige Subagenten, mit Details'],
      showTimeline: ['Zeitleiste', 'Wann welcher Agent lief, auf einer gemeinsamen Achse'],
      showFiles: ['Dateien', 'Gelesene, geänderte und committete Dateien als Baum, mit Diff'],
      usageContext: ['Kontext', 'Wie voll das Kontextfenster der Session ist'],
      usageFiveHour: ['5-Stunden-Limit', 'Verbrauch und Zeit bis zum Zurücksetzen'],
      usageWeek: ['Wochenlimit', 'Verbrauch und Zeit bis zum Zurücksetzen'],
      bandAgents: ['Crew-Zeile', 'Laufende, fertige und fehlgeschlagene Subagenten und Konflikte, über dem Prompt'],
      bandProgress: ['Fortschritt', 'Jeder laufende Subagent mit seinem Balken, über dem Prompt'],
      bandUsage: ['Nutzung', 'Kontext und Limits mit der Zeit bis zum Zurücksetzen, über dem Prompt'],
      statusLine: ['Statuszeile', 'Wie viele Subagenten laufen, in der Statuszeile von Claude Code'],
      autoOpen: ['Bei Subagenten öffnen', 'Das Panel öffnet sich, wenn der erste Subagent einer Session startet'],
      autoOpenFiles: ['Bei Dateiaktivität öffnen', 'Das Panel öffnet sich, wenn in einer Session zum ersten Mal eine Datei gelesen oder geändert wird'],
      language: ['Sprache', 'Automatisch folgt der Sprache von Claude Code, dann dem System'],
      crabMotion: ['Krabben-Animation', 'Flüssig: Das Panel zeichnet auf dem Desktop viermal pro Sekunde neu, solange ein Agent läuft. Sparsam: einmal pro Sekunde, der Schritt der Krabben beginnt dabei jedes Mal von vorn'],
      notifyAgents: ['Agent fertig', 'Wann eine Meldung kommt, wenn ein Subagent endet'],
      notifyVia: ['Meldungen als', 'In Claude Code oder als Benachrichtigung von Terminal bzw. System'],
      limitWarnings: ['Limit-Warnungen', 'Bei 80 % und 95 % eines Limits, und bei 85 % Kontext'],
      warnConflicts: ['Konflikt-Warnung', 'Wenn zwei Agenten innerhalb von 10 Minuten dieselbe Datei ändern'],
      checkUpdates: ['Update-Hinweis', 'Einmal am Tag nachsehen, ob es eine neue Version von agent-crew gibt, und Bescheid geben'],
    } as Record<string, [string, string]>,
    choices: {
      auto: 'Automatisch', de: 'Deutsch', en: 'English',
      off: 'Aus', failures: 'Nur Fehler', background: 'Hintergrund', all: 'Alle',
      toast: 'In Claude Code', system: 'System',
      smooth: 'Flüssig', light: 'Sparsam',
    } as Record<string, string>,
  },
  en: {
    title: 'Crew · Settings',
    groups: { sections: 'Sections', usage: 'Usage', band: 'Above the prompt', view: 'General', notify: 'Notifications' } as Record<Group, string>,
    version: 'Version',
    upToDate: 'Up to date',
    available: (v: string) => `${v} available`,
    checking: 'Checking …',
    checkNow: 'Check for updates',
    updateTo: (v: string) => `Update to ${v}`,
    updating: 'Updating …',
    updated: 'Installed, plugins reloading.',
    fromFolder: (root: string) => `Loaded from a folder (${root}): update it there with git pull.`,
    on: 'On',
    off: 'Off',
    locked: 'Set by your administrator',
    footer: 'The same values as /config. Changes apply at once.',
    opened: 'Crew settings opened.',
    open: 'Settings',
    fields: {
      showUsage: ['Usage', 'Context and limits at the top of the panel; the Usage group picks which'],
      showTotals: ['Cost', 'Main chat and subagents apart, with tokens and a total'],
      showAgents: ['Subagents', 'Running and finished subagents, with details'],
      showTimeline: ['Timeline', 'When each agent ran, on one shared axis'],
      showFiles: ['Files', 'Files read, changed and committed, as a tree with diffs'],
      usageContext: ['Context', 'How full the session’s context window is'],
      usageFiveHour: ['5-hour limit', 'Use so far and time until it resets'],
      usageWeek: ['Weekly limit', 'Use so far and time until it resets'],
      bandAgents: ['Crew line', 'Running, finished and failed subagents and conflicts, above the prompt'],
      bandProgress: ['Progress', 'Each running subagent with its bar, above the prompt'],
      bandUsage: ['Usage', 'Context and limits with the time until they reset, above the prompt'],
      statusLine: ['Status line', 'How many subagents run, in Claude Code’s status line'],
      autoOpen: ['Open on subagents', 'The panel opens when the first subagent of a session starts'],
      autoOpenFiles: ['Open on file activity', 'The panel opens when a file is first read or changed in a session'],
      language: ['Language', 'Automatic follows Claude Code’s language, then the system'],
      crabMotion: ['Crab animation', 'Smooth: on the desktop the panel redraws four times a second while an agent runs. Light: once a second, and the crabs’ step starts over each time'],
      notifyAgents: ['Agent finished', 'When a notice comes as a subagent ends'],
      notifyVia: ['Notices as', 'Inside Claude Code, or as the terminal’s or system’s notification'],
      limitWarnings: ['Limit warnings', 'At 80 % and 95 % of a limit, and at 85 % context'],
      warnConflicts: ['Conflict warning', 'When two agents change the same file within 10 minutes'],
      checkUpdates: ['Update notice', 'Look once a day for a new version of agent-crew, and say so'],
    } as Record<string, [string, string]>,
    choices: {
      auto: 'Automatic', de: 'Deutsch', en: 'English',
      off: 'Off', failures: 'Failures only', background: 'Background', all: 'All',
      toast: 'In Claude Code', system: 'System',
      smooth: 'Smooth', light: 'Light',
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
  if (key === 'statusLine' || key === 'language') await refreshStatus($)
  await update($, settingsRev, n => (n ?? 0) + 1)
}

export const register: Register = (on, options) => {
  opts = options
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await detectLang($, opts.language)
    fold = (await $.env.get('OS')) === 'Windows_NT'
    useDrives(fold)
    home = posix(((await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || '').replace(/[\\/]+$/, ''))
    // A new session starts the flip book afresh: a timer of an earlier one in
    // this module would otherwise stand in for one that runs.
    try {
      flipTimer?.cancel()
    } catch {
      // Gone with its session already.
    }
    flipTimer = undefined
    desktopDrawnAt = -Infinity
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
    // is open, git every ten seconds, so commits made outside show up too, and
    // the usage resets' countdowns every half minute.
    $.clock.every(1000, () => {
      void (async () => {
        tick++
        const list = await read($, runs)
        const at = await $.clock.now()
        const fresh = (await read($, files)).some(f => at - f.lastAt < FRESH_MS + 1000)
        const counts = tick % 30 === 0 && (await read($, usage)).limits.some(l => l.resetsAt)
        const isOpen = (tick % 10 === 0 || counts) && (await $.ui.panes()).some(p => p.id === PANE)
        // A reset's countdown moves where it shows: in the open pane, or in the band.
        if (list.some(r => r.status === 'running') || fresh || (counts && (isOpen || opts.bandUsage === true))) await update($, now, () => at)
        // While an agent runs, the pane redraws a few times a second: the crabs'
        // walk is a flip book of stills, one per redraw (CRAB_CSS in crab.ts).
        // Only where the crabs are pictures: the desktop pane, drawn of late.
        const isWalking = list.some(r => r.status === 'running') && at - desktopDrawnAt < 5_000 && flipAt(at) !== undefined
        if (isWalking && !flipTimer)
          flipTimer = $.clock.every(FLIP_MS, () => {
            // A flip waits for the drawing under way to end.
            if (drawing > 0) return
            void $.clock.now().then(t => update($, now, () => t)).catch(() => undefined)
          })
        if (!isWalking && flipTimer) {
          flipTimer.cancel()
          flipTimer = undefined
        }
        if (list.some(isActive) && tick % 3 === 0) await reconcile($)
        if (tick % 10 === 0 && isOpen) await syncGit($)
        // Every hour a look whether a day has passed since the last update check.
        if (tick % 3600 === 0 && opts.checkUpdates !== false) await checkUpdate($)
      })().catch(() => undefined)
    })
    await reconcile($)
    await refreshStatus($)
    void syncGit($).catch(() => undefined)
    // A moment after the start, so the session's first turn is not held up.
    if (opts.checkUpdates !== false) $.clock.after(5_000, () => void checkUpdate($).catch(() => undefined))
    else void checkUpdate($, false, true).catch(() => undefined)
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
  // The band above the prompt. A survey has it first. The platform shows one band;
  // a plugin beneath that draws its own (savvy-progress during a flow) is kept,
  // under ours, rather than pushed away.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    drawing++
    try {
      return await drawBand()
    } finally {
      drawing--
    }
    async function drawBand() {
      await read($, settingsRev)
      const list = await read($, runs)
      const fileList = await read($, files)
      const u = await read($, usage)
      const ui = $.ui.resolve(e)
      const { Box, Text } = ui
      const Client = 'Client' in ui ? ui.Client : undefined
      const BandSvg = e.surface === 'desktop' && 'Svg' in ui ? ui.Svg : undefined
      // The clock only where something moves with it: the crabs' walk on the desktop,
      // a bar, a reset's countdown. A band of counts alone redraws on changes only.
      const isWalking = Boolean(BandSvg) && list.some(r => r.status === 'running')
      const isTimed = isWalking || opts.bandProgress === true || opts.bandUsage === true
      const at = isTimed ? Math.max(await read($, now), await $.clock.now()) : await $.clock.now()
      // The band shows the crabs too: their flip book runs while it is drawn.
      if (isWalking) desktopDrawnAt = at
      const lines = bandLines(list, fileList, u, at)
      const below = await next(e)
      if (!lines.length) return below

      // /compact beside the usage, as in the pane's usage section: a click region,
      // so its press lands between redraws.
      const compactChip = Client ? (
        <Box key="band-compact-box" flexShrink={0} marginLeft={1}>
          <Client key="band-compact" module="./hotspot.tsx" props={{ id: 'compact', line: [{ t: ' /compact ' }], bg: '#6b6b6833', hoverBg: '#6b6b6866' } satisfies HotspotProps} />
        </Box>
      ) : null

      // On the desktop: pictures, the pane's crabs and usage rings, each under a
      // click region, since a picture takes no press.
      if (BandSvg && Client) {
        const W = Math.max(180, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 16))
        const hasCrew =
          (opts.bandAgents !== false && crewCounts(list, fileList).length > 0) || (opts.bandProgress === true && list.some(r => r.status === 'running'))
        const meters = opts.bandUsage === true ? metersOf(u).filter(m => opts[meterOption(m.key)] !== false) : []
        const s = tr()
        const hit = (key: string) => (
          <Box key={`${key}-hitbox`} position="absolute" top={0} left={0} right={0} bottom={0}>
            <Client key={key} module="./hotspot.tsx" width="100%" height="100%" props={{ id: 'band', hoverBg: '#3a3a3826' } satisfies HotspotProps} />
          </Box>
        )
        const pictures = (
          <Box key="crew-band" flexDirection="column">
            {hasCrew ? (
              <Box key="band-crew">
                <BandSvg source={bandCrewSvg(W, list, fileList, at)} alt={s.bandOpen} width={W} height={BAND_CREW_H} />
                {hit('band-0')}
              </Box>
            ) : null}
            {meters.length ? (
              <Box key="band-usage-row" flexDirection="row" alignItems="center">
                <Box key="band-usage">
                  <BandSvg source={usageSvg(W - COMPACT_W, meters, at)} alt={meters.map(m => `${m.percent}% ${m.label}`).join(', ')} width={W - COMPACT_W} height={USAGE_H} />
                  {hit('band-1')}
                </Box>
                {compactChip}
              </Box>
            ) : null}
          </Box>
        )
        if (hasCrew || meters.length) {
          return isEngineOwn(below) ? pictures : (
            <Box key="crew-band-stack" flexDirection="column">
              {pictures}
              {below}
            </Box>
          )
        }
      }

      const ours = (
        <Box key="crew-band" flexDirection="column">
          {lines.map(({ kind, segs: line }, i) =>
            Client ? (
              <Box key={`band-row-${i}`} flexDirection="row">
                <Box key={`band-cell-${i}`} flexGrow={1} flexShrink={1}>
                  <Client key={`band-${i}`} module="./hotspot.tsx" width="100%" props={{ id: 'band', line: line.map(plainHot), hoverBg: '#3a3a3826' } satisfies HotspotProps} />
                </Box>
                {kind === 'usage' ? compactChip : null}
              </Box>
            ) : (
              <Text key={`band-${i}`} wrap="truncate-end">
                {line.map((sg, j) => (
                  <Text key={`band-${i}-${j}`} color={sg.c} bold={sg.b} dimColor={sg.dim}>
                    {sg.t}
                  </Text>
                ))}
              </Text>
            ),
          )}
        </Box>
      )
      return isEngineOwn(below) ? ours : (
        <Box key="crew-band-stack" flexDirection="column">
          {ours}
          {below}
        </Box>
      )
    }
  })

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

    const group = (id: Group) => (
      <Box key={`group-${id}`} {...FRAME}>
        <Box marginBottom={1}>
          <Text bold dimColor>
            {f.groups[id]}
          </Text>
        </Box>
        {FIELDS.filter(x => x.group === id).map(fieldRow)}
      </Box>
    )

    // The version: this copy's, the published one, and the buttons to look and to update.
    const up = await read($, updateInfo)
    const hasNew = Boolean(up?.latest && isNewer(up.latest, up.current))
    const state = !up
      ? ''
      : up.phase === 'checking'
        ? f.checking
        : up.phase === 'updating'
          ? f.updating
          : up.phase === 'done'
            ? f.updated
            : up.phase === 'failed'
              ? (up.error ?? '')
              : hasNew && up.latest
                ? f.available(up.latest)
                : up.latest
                  ? f.upToDate
                  : ''
    const versionGroup = (
      <Box key="group-version" {...FRAME}>
        <Box marginBottom={1}>
          <Text bold dimColor>
            {f.version}
          </Text>
        </Box>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" marginBottom={1}>
          <Text>
            <Text bold>agent-crew {up?.current ?? ''}</Text>
            {state ? <Text color={hasNew && up?.phase !== 'done' ? CLAY : up?.phase === 'failed' ? 'red' : undefined} dimColor={!hasNew}>{`  ${state}`}</Text> : null}
          </Text>
          <Box flexDirection="row" gap={1}>
            <Button key="update-check" label={f.checkNow} variant="secondary" onPress={() => $.clock.after(1, () => void checkUpdate($, true).catch(() => undefined))} />
            {hasNew && up?.source === 'marketplace' && up.phase !== 'updating' && up.phase !== 'done' && up.latest ? (
              <Button key="update-run" label={f.updateTo(up.latest)} variant="primary" onPress={() => $.clock.after(1, () => void runUpdate($).catch(() => undefined))} />
            ) : null}
          </Box>
        </Box>
        {up?.source === 'folder' && <Text dimColor wrap="wrap">{f.fromFolder(up.root)}</Text>}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        {GROUPS.map(group)}
        {versionGroup}
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
    await storeRuns($, list => [...list.filter(r => r.id !== run.id), run])
    await update($, now, () => at)
    await refreshStatus($)

    const p = await readPanel($)
    if (p.tab !== 'active') await setPanel($, () => ({ tab: 'active' }))
    await autoOpenPane($, 'agents')
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

  // The search field never hears that it lost the keys: whatever else takes
  // them (the prompt box, a button or the ring in the pane) ends its focus.
  on('prompt.edit', async ($, e, next) => {
    await blurSearch($)
    return next(e)
  })
  on('ui.press', { requestId: PANE }, async ($, e, next) => {
    await blurSearch($)
    return next(e)
  })
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    await blurSearch($)
    return next(e)
  })

  // A click in one of the pane's Clients: a tab of the tab strip, or a row of
  // the file tree.
  on('ui.message', async ($, e, next) => {
    // The band's /compact: a dispatch of its own, as the pane's button does.
    if (e.element === 'band-compact' && (e.data as { press?: unknown } | undefined)?.press === 'compact') {
      $.clock.after(1, () => void $.command.run({ command: 'compact' }).catch(() => undefined))
      return {}
    }
    // A click on the band above the prompt brings the pane into view, never a
    // toggle. It opens in the answer to the click, so the host counts it as the
    // person's own open and places it at any width; this hook awaits it.
    if (typeof e.element === 'string' && e.element.startsWith('band-') && (e.data as { press?: unknown } | undefined)?.press === 'band') {
      await showPane($)
      return {}
    }
    if (e.requestId !== PANE || typeof e.element !== 'string' || !e.data || typeof e.data !== 'object') return next(e)
    if (e.element === 'tabs') {
      await blurSearch($)
      const tab = (e.data as { tab?: unknown }).tab
      if (tab === 'active' || tab === 'done') await setPanel($, () => ({ tab }))
      return {}
    }
    // The desktop's click regions (hotspot.tsx): a tab, or an agent's row.
    const press = (e.data as { press?: unknown }).press
    if (e.element.startsWith('tabhit-') && (press === 'active' || press === 'done')) {
      await blurSearch($)
      await setPanel($, () => ({ tab: press }))
      return {}
    }
    if (e.element.startsWith('rowhit-') && typeof press === 'string') {
      await blurSearch($)
      await setPanel($, q => ({ expanded: q.expanded.includes(press) ? q.expanded.filter(x => x !== press) : [...q.expanded, press].slice(-20) }))
      return {}
    }
    if (e.element === 'search') {
      const data = e.data as { query?: unknown; submit?: unknown; focus?: unknown }
      if (data.focus === true && !(await readPanel($)).isSearchFocused) await setPanel($, () => ({ isSearchFocused: true }))
      if (typeof data.query === 'string') {
        const query = data.query
        await setPanel($, () => ({ fileQuery: query }))
      }
      if (typeof data.submit === 'string') await openFirstHit($, data.submit)
      return {}
    }
    if (e.element.startsWith('rows-')) {
      await blurSearch($)
      const id = (e.data as { press?: unknown }).press
      const isOpen = (e.data as { isOpen?: unknown }).isOpen
      if (typeof id === 'string') await pressRow($, id, typeof isOpen === 'boolean' ? isOpen : undefined)
      return {}
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // A drawing that throws shows its error, not an empty pane: the desktop says
    // only that nothing was drawn, and no log may be on to say why.
    drawing++
    try {
      return await drawPane()
    } catch (err) {
      const { Box, Text } = $.ui.resolve(e)
      const text = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
      return (
        <Box key="pane-error" flexDirection="column">
          <Text color="red">agent-crew could not draw this pane:</Text>
          <Text dimColor>{text.slice(0, 3000)}</Text>
        </Box>
      )
    } finally {
      drawing--
    }
    async function drawPane() {
      const s = tr()
      const ui = $.ui.resolve(e)
      const { Box, Text, Button } = ui
      const list = await read($, runs)
      const allLogs = await read($, logs)
      const p = await readPanel($)
      const gone = await read($, cleared)
      const fileList = await read($, files)
      const g = await read($, git)
      // Reading `now` redraws the pane: each second, and four times a second while
      // a crab walks on the desktop (flipTimer). The time itself is the clock's,
      // since a step redraws it in between too, and a crab or a gliding bar set by
      // the last tick would jump back by the part of it gone since.
      const at = Math.max(await read($, now), await $.clock.now(), ...list.map(r => r.startedAt), 0)
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
      const showAgents = opts.showAgents !== false
      const showFiles = opts.showFiles !== false
      // Drawn again when a setting changes in the settings pane.
      await read($, settingsRev)
      const meters = metersOf(await read($, usage)).filter(m => opts[meterOption(m.key)] !== false)
      // A new version shows beside the settings, which install it.
      const up = await read($, updateInfo)
      const newVersion = opts.checkUpdates !== false && up?.latest && isNewer(up.latest, up.current) && up.phase !== 'done' ? up.latest : ''
      const settingsRow = (
        <Box key="settings-row" flexDirection="row" justifyContent="flex-end" gap={2}>
          {newVersion ? <Button key="update-badge" label={s.updateBadge(newVersion)} variant="primary" onPress={() => openSettings($)} /> : null}
          <Button key="open-settings" label={`⚙ ${ft().open}`} plain onPress={() => openSettings($)} />
        </Box>
      )
      const compactButton = (
        <Button
          key="run-compact"
          label="/compact"
          variant="secondary"
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
      // line up there: its tabs are bordered Boxes the app draws itself. Inside,
      // a Client takes the press, so a click lands while the crabs' flip book
      // redraws the pane; and while an agent runs, the Active tab's dot pulses.
      const isAnyRunning = list.some(r => r.status === 'running')
      const boxTabs = (
        <Box key="tab-row" flexDirection="row" alignItems="flex-end">
          {tabSpecs.map(t => {
            const isOn = p.tab === t.id
            const line: HotspotProps['line'] = [
              { t: t.icon, c: isOn ? t.color : undefined, dim: !isOn, pulse: t.id === 'active' && isAnyRunning },
              { t: ' ' },
              { t: t.label, b: isOn, dim: !isOn },
              { t: ' ' },
              { t: String(t.count), c: isOn ? t.color : undefined, dim: true },
            ]
            // The pulse needs a colour, also on the tab not chosen.
            if (line[0] && line[0].pulse) line[0].c = t.color
            return (
              <Box
                key={`tabbox-${t.id}`}
                flexDirection="row"
                alignItems="center"
                borderStyle="round"
                borderColor={isOn ? t.color : '#6b6b68'}
                borderDimColor={!isOn}
                paddingX={1}
                marginRight={1}
                hover={{ borderColor: isOn ? t.color : '#9a9a96' }}
              >
                {Client ? (
                  <Client key={`tabhit-${t.id}`} module="./hotspot.tsx" props={{ id: t.id, line: line.map(plainHot) } satisfies HotspotProps} />
                ) : (
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
                )}
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
                // What leaves is what the one write took off: an agent that ends in
                // between is either kept or retired, never dropped unaccounted.
                let gone: CrewRun[] = []
                await update($, runs, l => {
                  gone = l.filter(r => !isActive(r))
                  return l.filter(isActive)
                })
                await retire($, gone)
                // A focus on an agent that is gone would dim the tree with no way back.
                if (gone.some(r => r.agentId && r.agentId === p.focusAgent)) await setPanel($, () => ({ focusAgent: undefined }))
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
      // The search line narrows the tree to the paths that hold what was typed.
      // A folder entered by a double press narrows it to that folder, labels relative.
      const query = (p.fileQuery ?? '').trim().toLowerCase()
      const root = p.fileRoot ?? ''
      const everyFile = await read($, tree)
      if (p.fileFilter === 'all' && !everyFile) $.clock.after(1, () => void syncTree($).catch(() => undefined))
      const allViews = underFolder(fileViews(fileList, g, base, p.fileFilter, everyFile?.paths), root, fold)
      const views = query ? allViews.filter(v => v.label.toLowerCase().includes(query)) : allViews
      const treeAll = rowsUnder(views.map(v => ({ key: v.key, label: v.label })), root, fold)
      const dirKeys = treeAll.filter(r => r.isDir).map(r => r.key)
      // Folders are shut until opened; a search opens every one that holds a hit,
      // and a file just read, changed or committed opens its folders while it
      // shimmers, so what the agents touch shows. They shut again after, unless opened.
      const openDirs = new Set(p.openDirs ?? [])
      const shutAt = p.shutAt ?? {}
      const freshDirs = new Set(
        views.flatMap(v => (v.file && at - v.file.lastAt < FRESH_MS ? folderKeys(v.label, root, fold).filter(k => (shutAt[k] ?? -Infinity) < (v.file?.lastAt ?? 0)) : [])),
      )
      const shut = new Set(query ? [] : dirKeys.filter(k => !openDirs.has(k) && !freshDirs.has(k)))
      const isAllShut = dirKeys.length > 0 && dirKeys.every(k => shut.has(k))
      const branch = g ? `⑂ ${g.branch || 'HEAD'}${g.ahead ? ` ↑${g.ahead}` : ''}${g.behind ? ` ↓${g.behind}` : ''}` : ''
      const focusRun = p.focusAgent ? byAgent.get(p.focusAgent) : undefined
      const filesHeader = (
        <Box key="files-head" flexDirection="row" alignItems="center" gap={2} marginBottom={p.isFilesCollapsed ? 0 : 1}>
          <Button
            key="files-toggle"
            label={`${p.isFilesCollapsed ? '▸' : '▾'} ${s.files} · ${views.length}`}
            plain
            onPress={() => setPanel($, q => ({ isFilesCollapsed: !q.isFilesCollapsed }))}
          />
          <Text dimColor>│</Text>
          {(['activity', 'changed', 'all'] as const).map(id => (
            <Button
              key={`files-filter-${id}`}
              label={s.fileFilters[id]}
              variant={p.fileFilter === id ? 'primary' : 'secondary'}
              onPress={async () => {
                await setPanel($, () => ({ fileFilter: id }))
                // A press's own work ends with it: the list is read in a dispatch of its own.
                if (id === 'all') $.clock.after(1, () => void syncTree($).catch(() => undefined))
              }}
            />
          ))}
          {focusRun && (
            <Button key="focus-clear" plain onPress={() => setPanel($, () => ({ focusAgent: undefined }))}>
              <Text color={colorOf(focusRun)}>◎ {oneLine(focusRun.description || typeLabel(focusRun), 30)}</Text> ✕
            </Button>
          )}
          <Box flexGrow={1} />
          {/* A search shows every folder with a hit open: nothing to fold then. */}
          {!p.isFilesCollapsed && !query && dirKeys.length > 0 && (
            <Button
              key="files-fold-all"
              label={isAllShut ? '⊞' : '⊟'}
              plain
              dimColor
              onPress={async () => {
                const t = await $.clock.now()
                await setPanel($, q => {
                  const open = (q.openDirs ?? []).filter(k => !dirKeys.includes(k))
                  if (isAllShut) return { openDirs: [...open, ...dirKeys].slice(-500) }
                  // Shut means shut, also for folders a fresh file holds open.
                  const shutAt = { ...(q.shutAt ?? {}), ...Object.fromEntries(dirKeys.map(k => [k, t])) }
                  return { openDirs: open, shutAt: Object.fromEntries(Object.entries(shutAt).slice(-200)) }
                })
              }}
            />
          )}
          <Button key="files-refresh" label="↻" plain dimColor onPress={() => syncGit($)} />
        </Box>
      )

      // Breadcrumbs under the search line, the main folder first and the branch
      // last: a heading, so it reads larger than the rows. Once a folder is
      // entered, the steps above it are links (the folder's own file: URL) back up.
      const crumbs = root.split('/').filter(Boolean)
      const folderUrl = (tree: string): string => {
        const abs = !tree ? base : tree.startsWith('~') ? home + tree.slice(1) : /^[A-Za-z]:/.test(tree) || base === '' ? tree : `${base}/${tree}`
        return encodeURI(`file:///${abs.replace(/^\//, '')}`)
      }
      const steps = [{ label: `⌂ ${base.split('/').pop() || base}`, tree: '' }, ...crumbs.map((c, i) => ({ label: c, tree: crumbs.slice(0, i + 1).join('/') }))]
      const crumbLinks = steps.slice(0, -1).map(st => ({ ...st, href: folderUrl(st.tree) }))
      const crumbText =
        [...crumbLinks.map(st => `[${st.label.replace(/[[\]]/g, '')}](${st.href})`), `**${steps.at(-1)?.label ?? ''}**`].join(' › ') +
        (branch ? `  \`${branch}\`` : '')
      const Md = 'Markdown' in ui ? ui.Markdown : undefined
      const crumbRow =
        !p.isFilesCollapsed && Md ? (
          <Box key="files-crumbs-box" marginY={1}>
            <Md
              key="files-crumbs"
              text={`#### ${crumbText}`}
              pressableLinks={crumbLinks.map(st => st.href)}
              onLinkPress={(link: { href: string }) => {
                const st = crumbLinks.find(x => x.href === link.href)
                if (st) void setPanel($, () => ({ fileRoot: st.tree || undefined, openFile: undefined }))
              }}
            />
          </Box>
        ) : null

      // The search line: on the cell grid where the surface has a Client, the
      // frame's whole width and no button; elsewhere the surface's own field. Enter
      // opens the first hit's history and diff.
      const SearchInput = 'Input' in ui ? ui.Input : undefined
      const searchRow =
        !p.isFilesCollapsed && allViews.length > 0 ? (
          Client ? (
            <Client
              key="search"
              module="./searchbox.tsx"
              width="100%"
              props={{ value: p.fileQuery ?? '', placeholder: s.search, hits: query ? s.hits(views.length) : '', line: '#6b6b68', accent: CLAY, isFocused: p.isSearchFocused === true } satisfies SearchBoxProps}
            />
          ) : SearchInput ? (
            <Box key="files-search" flexDirection="row" alignItems="center" gap={1}>
              <Box flexGrow={1}>
                <SearchInput
                  key="file-q"
                  placeholder={s.search}
                  value={p.fileQuery ?? ''}
                  onInput={(text: string) => void setPanel($, () => ({ fileQuery: text }))}
                  onSubmit={(text: string) => void openFirstHit($, text)}
                />
              </Box>
              {query ? <Text dimColor>{s.hits(views.length)}</Text> : null}
              {query ? <Button key="file-q-clear" label="×" plain onPress={() => setPanel($, () => ({ fileQuery: '' }))} /> : null}
            </Box>
          ) : null
        ) : null

      // About 8 CSS px a column on the desktop, less the frame's border and padding.
      const desktopW = Math.max(220, Math.min(900, ((e.props.bodyColumns || 40) - FRAME_COLS) * 8 - 8))

      // A thin rule across the frame: drawn as a picture of its width on the
      // desktop, whose lines are taller than a cell; as many dashes as cells elsewhere.
      const RuleSvg = isDesktop && 'Svg' in ui ? ui.Svg : undefined
      const ruleRow = (key: string) =>
        RuleSvg ? (
          <RuleSvg key={key} source={svg(desktopW, 9, `<line x1="0" y1="4.5" x2="${desktopW}" y2="4.5" stroke="#6b6b68" stroke-opacity=".6" stroke-width="1"/>`, false)} alt="—" width={desktopW} height={9} />
        ) : (
          <Text key={key} dimColor>
            {'─'.repeat(Math.max(10, (e.props.bodyColumns || 40) - FRAME_COLS))}
          </Text>
        )

      // One file row is one Button: a press opens its history and diff beneath it.
      const fileTree = visibleRows(treeAll, shut)
      const viewByKey = new Map(views.map(v => [v.key, v]))
      const openDiff = await read($, diff)
      // An open file's card: its history and its changes against HEAD (the text
      // of a new file) in two tabs, with Open beside them; a file git sees no
      // change in has its history alone, no tabs and no heading. The tab chosen stays for the
      // next file; absent a choice, the changes.
      const fileDetails = (v: FileView, pad: string) => {
        const hist = [...(v.file?.history ?? [])].reverse()
        const d = openDiff && openDiff.key === v.key ? openDiff : null
        const Code = 'Code' in ui ? ui.Code : undefined
        const hasChanges = Boolean(d || v.gitFile)
        const tab = !hasChanges || p.fileTab === 'history' ? 'history' : 'changes'
        const badge = gitBadge(v)
        const tabs = [
          { id: 'history' as const, label: s.history, count: hist.length ? String(hist.length) : '' },
          ...(hasChanges ? [{ id: 'changes' as const, label: d?.format === 'source' ? s.newFile : s.changes, count: badge }] : []),
        ]
        return (
          <Box key={`fd-${v.key}`} flexDirection="column" marginTop={1}>
            {v.file?.conflict && v.file.conflict.length > 1 && (
              <Text color="red">
                {pad}
                {s.conflictLine(v.file.conflict.map(a => (a === 'main' ? s.main : byAgent.get(a)?.description || a.slice(0, 8))).join(', '))}
              </Text>
            )}
            <Box flexDirection="row" justifyContent="space-between" alignItems="center">
              {hasChanges ? (
                <Box flexDirection="row" alignItems="center" gap={1}>
                  {tabs.map(t => (
                    <Button
                      key={`ftab-${t.id}`}
                      label={t.count ? `${t.label} ${t.count}` : t.label}
                      variant={tab === t.id ? 'primary' : 'secondary'}
                      onPress={() => setPanel($, () => ({ fileTab: t.id }))}
                    />
                  ))}
                </Box>
              ) : (
                <Box />
              )}
              <Button key={`open-${v.key}`} label={`↗ ${s.openIt}`} variant="secondary" onPress={() => openFile($, v.file?.path ?? v.gitFile?.path ?? v.key)} />
            </Box>
            <Box flexDirection="column" marginTop={1}>
              {tab === 'history' &&
                hist.map((ev, i) => (
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
              {tab === 'history' && hist.length === 0 && <Text dimColor>{s.noHistory}</Text>}
              {tab === 'changes' && d && Code && <Code key={`code-${v.key}`} source={d.text} format={d.format} path={v.label} wrap="truncate-end" />}
              {tab === 'changes' && d && !Code && <Text>{d.text.slice(0, 2000)}</Text>}
              {tab === 'changes' && !d && (
                <Text dimColor>
                  {pad}
                  {s.noDiff}
                </Text>
              )}
            </Box>
          </Box>
        )
      }
      // One row a file, as filetree's: a press on it opens its card (history and
      // diff), a double press the file itself; a folder shuts and opens on a press.
      // Where the surface has a Client the rows are drawn on its cell grid, a fresh
      // name shimmering while it still takes presses; elsewhere each row is a Button.
      // A shut folder sums up the files inside it; an open one leaves that to its rows.
      const beneath = filesBeneath(treeAll)
      const folderSigns = (key: string): Seg[] =>
        shut.has(key) ? folderSummary((beneath.get(key) ?? []).flatMap(k => viewByKey.get(k) ?? []), byAgent, focusRun ? p.focusAgent : undefined) : []
      const fileRowsOf = (rows: TreeRow[], base: number): FileRowSpec[] =>
        rows.flatMap((r): FileRowSpec[] => {
          const indent = '  '.repeat(Math.max(0, r.depth - base))
          if (r.isDir) return [{ id: r.key, isOpen: !shut.has(r.key), left: [{ t: `${indent}${shut.has(r.key) ? '▸' : '▾'} ${r.name}/`, dim: true }], right: folderSigns(r.key) }]
          const v = viewByKey.get(r.key)
          if (!v) return []
          const color = fileColor(v)
          const badge = gitBadge(v)
          const isFresh = Boolean(v.file && at - v.file.lastAt < FRESH_MS)
          const isOpen = p.openFile === v.key
          // Only while the focused agent is listed, and so its ✕ in the header with it.
          const isDim = Boolean(focusRun && p.focusAgent && !(v.file?.agents ?? []).includes(p.focusAgent))
          const tone = isFresh && !isDim ? (isDeleted(v) ? 'delete' : isNew(v) ? 'new' : (v.file?.lastKind ?? 'read')) : undefined
          const right: Seg[] = (v.file?.agents.slice(0, 6) ?? []).map(a => ({ t: '●', c: agentColor(a, byAgent), dim: isDim }))
          if (badge) right.push({ t: ` ${badge}`, c: badgeColor(v), dim: isDim })
          if ((v.file?.conflict?.length ?? 0) > 1) right.push({ t: ' ⚠', c: '#D0453F' })
          right.push({ t: ` ${isOpen ? '▾' : '▸'} `, dim: true })
          return [
            {
              id: r.key,
              left: [
                { t: indent },
                { t: `${fileGlyph(v)} `, c: color, dim: isDim, sh: tone },
                { t: r.name, b: isFresh || isOpen, c: isOpen ? color : undefined, dim: isDim || isUntouched(v), sh: tone },
              ],
              right,
            },
          ]
        })
      const rowsClient = (key: string, rows: TreeRow[], base = 0) =>
        Client && rows.length > 0 ? (
          <Client
            key={key}
            module="./filerows.tsx"
            width="100%"
            props={{ rows: fileRowsOf(rows, base).map(r => ({ ...r, left: r.left.map(plainSeg), right: r.right.map(plainSeg) })), tones: SHIMMER, hoverBg: '#3a3a3826' } satisfies FileRowsProps}
          />
        ) : null

      // Without a Client: a Button a row, the same presses.
      const buttonRow = (r: TreeRow) => {
        if (r.isDir)
          return (
            <Box key={`f-${r.key}`} flexDirection="row" justifyContent="space-between" gap={1} marginLeft={r.depth * 2}>
              <Button key={`dir-${r.key}`} plain dimColor onPress={() => pressRow($, r.key, !shut.has(r.key))}>
                {shut.has(r.key) ? '▸' : '▾'} {r.name}/
              </Button>
              <Text>
                {folderSigns(r.key).map((sg, i) => (
                  <Text key={`ds-${r.key}-${i}`} color={sg.c} dimColor={sg.dim}>
                    {sg.t}
                  </Text>
                ))}
              </Text>
            </Box>
          )
        const v = viewByKey.get(r.key)
        if (!v) return null
        const color = fileColor(v)
        const badge = gitBadge(v)
        const isOpen = p.openFile === v.key
        return (
          <Box key={`f-${r.key}`} flexDirection="row" justifyContent="space-between" gap={1} marginLeft={isOpen ? 0 : r.depth * 2}>
            <Button key={`file-${r.key}`} plain onPress={() => pressRow($, v.key)}>
              <Text color={color}>{`${fileGlyph(v)} `}</Text>
              <Text bold={isOpen}>{r.name}</Text>
            </Button>
            <Text>
              {(v.file?.agents.slice(0, 6) ?? []).map(a => (
                <Text key={`fa-${r.key}-${a}`} color={agentColor(a, byAgent)}>
                  ●
                </Text>
              ))}
              {badge ? <Text color={badgeColor(v)}> {badge}</Text> : null}
              {(v.file?.conflict?.length ?? 0) > 1 ? <Text color="red"> ⚠</Text> : null}
            </Text>
          </Box>
        )
      }

      // The open file and its card sit between the rows above and below it.
      const shownRows = fileTree.slice(0, MAX_FILE_ROWS)
      const openIdx = shownRows.findIndex(r => !r.isDir && r.key === p.openFile)
      const openRow = openIdx >= 0 ? shownRows[openIdx] : undefined
      const openView = openRow ? viewByKey.get(openRow.key) : undefined
      const above = openIdx >= 0 ? shownRows.slice(0, openIdx) : shownRows
      const below = openIdx >= 0 ? shownRows.slice(openIdx + 1) : []
      const rowsOf = (key: string, rows: TreeRow[], base = 0) => (Client ? rowsClient(key, rows, base) : rows.map(buttonRow))
      const openCard =
        openRow && openView ? (
          // The card spans the tree's width; only its row keeps the tree's indent, one
          // step less for the card's border and padding, so the name stays in line.
          <Box key="f-open" {...card((openView.file?.conflict?.length ?? 0) > 1 ? '#D0453F' : fileColor(openView), 0)}>
            {rowsOf('rows-o', [openRow], Math.min(1, openRow.depth))}
            {fileDetails(openView, '')}
          </Box>
        ) : null
      const filesBody = (
        <Box key="files-body" flexDirection="column">
          {!p.isFilesCollapsed && views.length === 0 && <Text dimColor>{query ? s.noHits : s.noFiles}</Text>}
          {!p.isFilesCollapsed && rowsOf('rows-a', above)}
          {!p.isFilesCollapsed && openCard}
          {!p.isFilesCollapsed && rowsOf('rows-b', below)}
          {!p.isFilesCollapsed && fileTree.length > MAX_FILE_ROWS && <Text dimColor>{s.more(fileTree.length - MAX_FILE_ROWS)}</Text>}
          {!p.isFilesCollapsed && views.length > 0 && (
            // Set off from the tree by a rule; each sign in the colour it marks.
            <Box key="files-legend" flexDirection="column" marginTop={1}>
              {ruleRow('files-rule')}
              <Text>
                {(
                  [
                    ['◉', READ_COLOR, s.legend.read],
                    ['✎', WRITE_COLOR, s.legend.write],
                    ['+', NEW_COLOR, s.legend.isNew],
                    ['✓', COMMIT_COLOR, s.legend.commit],
                    ['✗', DELETE_COLOR, s.legend.delete],
                  ] as const
                ).map(([sign, color, label], i) => (
                  <Text key={`lg-${i}`}>
                    {i ? '   ' : ''}
                    <Text color={color}>{sign}</Text> <Text color={color}>{label}</Text>
                  </Text>
                ))}
              </Text>
            </Box>
          )}
        </Box>
      )

      // --- the timeline, by the `showTimeline` option.
      const showTimeline = opts.showTimeline !== false && list.length > 0
      const isAllHidden = !showUsage && !showTotals && !showAgents && opts.showTimeline === false && !showFiles
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
        desktopDrawnAt = at
        const W = desktopW
        // The row's picture leaves room at its right for the Details button. An
        // expanded agent and its details share a card framed in the agent's colour,
        // indented by its depth; the picture inside it draws no indent of its own.
        const runW = W - 36
        const row = ({ run, depth }: { run: CrewRun; depth: number }) => {
          const isOpen = p.expanded.includes(run.id)
          const w = isOpen ? runW - FRAME_COLS * 8 - depth * 16 : runW
          const d = isOpen ? 0 : depth
          // The status mark beside the picture: a running agent's dot pulses in a
          // Client, any other mark is a still picture.
          const mark =
            run.status === 'running' && Client ? (
              <Box key={`mark-${run.id}`} flexShrink={0} width={3} justifyContent="center">
                <Client key={`pulse-${run.id}`} module="./hotspot.tsx" props={{ line: [{ t: '●', c: colorOf(run), pulse: true }] } satisfies HotspotProps} />
              </Box>
            ) : (
              <Box key={`mark-${run.id}`} flexShrink={0}>
                <Svg source={runMarkSvg(run)} alt={STATUS_GLYPH[run.status]} width={MARK_W} height={ROW_H} />
              </Box>
            )
          // A click anywhere on the row opens or shuts its details: a Client laid
          // over the picture takes it on the press, so it lands while the pane
          // redraws for the crabs' walk, and it draws the ▸ itself.
          const hit = Client ? (
            <Box key={`hitbox-${run.id}`} position="absolute" top={0} left={0} right={0} bottom={0}>
              <Client
                key={`rowhit-${run.id}`}
                module="./hotspot.tsx"
                width="100%"
                height="100%"
                props={{ id: run.id, line: [{ t: `${isOpen ? '▾' : '▸'} `, dim: true }], isRight: true, hoverBg: '#3a3a3826' } satisfies HotspotProps}
              />
            </Box>
          ) : null
          const line = (
            <Box flexDirection="row" alignItems="flex-start" justifyContent="space-between">
              <Box flexDirection="row" alignItems="flex-start">
                <Svg
                  source={runSvg(w - MARK_W, run, d, byAgent, at, run.agentId !== undefined && run.agentId === viewed)}
                  alt={`${run.description || typeLabel(run)}: ${typeLabel(run)}, ${modelName(run.model)}, ${isActive(run) ? s.isRunning : s.isFinished}`}
                  width={w - MARK_W}
                  height={ROW_H}
                />
                {mark}
              </Box>
              {hit ? <Box key={`hitroom-${run.id}`} width={3} /> : detailsButton(run)}
              {hit}
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
        const compact = compactSvg(W, list.filter(isActive), list.filter(r => !isActive(r)), null, at)
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
              </Box>
            )}
            {showAgents &&
              (p.isCompact ? (
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
              ))}
            {showTimeline && (
              <Box key="sec-timeline" {...FRAME}>
                {timelineToggle}
                {timeline && <Svg source={timeline.source} alt={s.timeline} width={W} height={timeline.height} />}
              </Box>
            )}
            {showFiles && (
              <Box key="sec-files" {...FRAME}>
                {filesHeader}
                {searchRow}
                {crumbRow}
                {filesBody}
              </Box>
            )}
            {isAllHidden && <Text dimColor>{s.allHidden}</Text>}
          </Box>
        )
      }

      // Terminal and the other surfaces: the same content in text rows.
      const cols = Math.max(24, (e.props.bodyColumns || 40) - FRAME_COLS)
      const costBarW = Math.max(6, cols - 2)
      const barW = Math.max(6, Math.min(20, cols - 34))
      const bar = (b: AgentBar) => cellBar(b.share, barW)
      const row = ({ run, depth }: { run: CrewRun; depth: number }) => {
        const color = colorOf(run)
        const ctx = ctxOf(run)
        const agentBar = barOf(run, at)
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
              <Text color={agentBar.color}>{bar(agentBar)}</Text>
              {agentBar.label ? <Text> {agentBar.label}</Text> : null}
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
            </Box>
          )}
          {showAgents && (
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
          )}
          {showTimeline && (
            <Box key="sec-timeline" {...FRAME}>
              {timelineToggle}
              {p.isTimelineOpen && timelineRows()}
            </Box>
          )}
          {showFiles && (
            <Box key="sec-files" {...FRAME}>
              {filesHeader}
              {searchRow}
              {crumbRow}
              {filesBody}
            </Box>
          )}
          {isAllHidden && <Text dimColor>{s.allHidden}</Text>}
        </Box>
      )
    }
  })
}
