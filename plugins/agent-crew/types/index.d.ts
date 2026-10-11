/** Where a run stands: `idle` is a teammate or background agent waiting for a message. */
export type CrewStatus = 'running' | 'idle' | 'done' | 'failed' | 'stopped'

/** How the run was started. `listed` came from `$.agent.list()` without a spawn the mod saw. */
export type CrewKind = 'agent' | 'fork' | 'teammate' | 'workflow' | 'listed'

export type CrewRun = {
  /** The engine's agent id, or the spawn's tool_use_id when the engine gave none. */
  id: string
  agentId?: string
  kind: CrewKind
  type: string
  description: string
  /** The task as given, cut to a few thousand characters. */
  prompt?: string
  name?: string
  model: string
  effort?: string
  isBackground: boolean
  parentId?: string
  workflowRunId?: string
  workflowIndex?: number
  status: CrewStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax: number
  tokens: number
  costUsd: number
  steps: number
  /** Tokens the cache served across its requests; `tokens` counts the new ones. */
  cacheTokens?: number
  /** The last thing it did, one line (`Read hooks/files.ts`). */
  lastAction?: string
  /** Progress the agent reported itself through savvy-progress's `step` tool: steps done of planned, and the one under way. */
  report?: { done: number; total: number; note?: string }
  /** Its final answer, cut to a few thousand characters. */
  lastAnswer?: string
}

/** One entry of a subagent's activity log: a tool call, or text it wrote between calls. */
export type CrewLog = {
  at: number
  kind: 'tool' | 'say'
  tool?: string
  text: string
  isError?: boolean
}

export type CrewTab = 'active' | 'done'

export type CrewPanel = {
  tab: CrewTab
  expanded: string[]
  isCompact: boolean
  hasAutoOpened: boolean
  /** What the file tree shows: what the session's agents read and changed, the changes alone, or every file. */
  fileFilter: 'activity' | 'changed' | 'all'
  isFilesCollapsed: boolean
  /** The file whose history and diff are open. */
  openFile?: string
  /** The tab of an open file's card: its history or its changes. */
  fileTab?: 'history' | 'changes'
  /** Folders of the file tree opened by a press; every other one is shut. */
  openDirs?: string[]
  /** When a folder was shut by a press: a file touched before that no longer opens it. */
  shutAt?: Record<string, number>
  /** The folder the file tree shows (`src/auth`), entered by a double press; absent, the whole tree. */
  fileRoot?: string
  /** What the search line above the file tree holds. */
  fileQuery?: string
  /** Whether the search line holds the keys, as far as the hooks can tell. */
  isSearchFocused?: boolean
  /** An agent whose files are lit while the rest dim. */
  focusAgent?: string
  isTimelineOpen: boolean
}

/** What "Clear finished" took off the list, so the session totals stay whole. */
export type CrewCleared = {
  cost: number
  tokens: number
  cache?: number
  /** Agents cleared or trimmed from the list, so the engine's list does not bring them back. */
  ids?: string[]
}

/** What the update check found: this copy's version, the published one, where this copy loads from. */
export type CrewUpdate = {
  current: string
  latest?: string
  /** `marketplace`: an installed copy, updated by `claude plugin update`; `folder`: loaded from a folder of its own (a working copy). */
  source: 'marketplace' | 'folder'
  root: string
  /** Where an update stands: being checked or installed, failed with a reason, or installed. */
  phase?: 'checking' | 'updating' | 'failed' | 'done'
  error?: string
}

export type CrewFile = {
  /** Case-folded on Windows; what git status and tool calls are matched by. */
  key: string
  path: string
  reads: number
  writes: number
  lastAt: number
  lastKind: 'read' | 'write' | 'commit'
  /** Agent ids that touched it; `main` for the main conversation. */
  agents: string[]
  commit?: string
  commitAt?: number
  /** Who read, changed or committed it and when, newest last. */
  history?: CrewFileEvent[]
  /** Agents that changed it close together; cleared when it is committed. */
  conflict?: string[]
  /** Its writes within the conflict window since the last commit, apart from the shown history, which reads push out. */
  recentWrites?: { at: number; agent: string }[]
}

export type CrewFileEvent = {
  at: number
  agent: string
  kind: 'read' | 'write' | 'commit'
}

export type CrewGitFile = {
  path: string
  /** Porcelain XY: ` M`, `M `, `??`, `A `, ` D`, ... */
  code: string
  add: number
  del: number
}

export type CrewGit = {
  root: string
  branch: string
  upstream: string
  ahead: number
  behind: number
  head: string
  files: Record<string, CrewGitFile>
}

/** The session's context fill and the plan's rate-limit windows, as the status line has them. */
export type CrewUsage = {
  context: { percent: number | null; tokens?: number; window: number }
  limits: { kind: string; percent: number; resetsAt?: string }[]
}

declare module 'claude-code' {
  interface PluginState {
    'agent-crew': {
      runs: CrewRun[]
      logs: Record<string, CrewLog[]>
      panel: CrewPanel
      cleared: CrewCleared
      files: CrewFile[]
      git: CrewGit | null
      now: number
      usage: CrewUsage
      /** The diff of the open file, as git printed it (or its text when untracked). */
      diff: { key: string; text: string; format: 'diff' | 'source' } | null
      /** The highest level each usage meter was warned at (0, 80, 95). */
      warned: Record<string, number>
      /** Bumped on each change from the settings pane, so both panes draw again. */
      settingsRev: number
      /** The main chat's own requests since the mod loaded: estimated cost and tokens. */
      mainCost: { cost: number; tokens: number; cache?: number }
      /** The running version and the newest one published, for the update notice and the settings. */
      update: CrewUpdate | null
      /** Every file under the root, for the tree's "All" filter: git's own list, or a bounded walk. */
      tree: { root: string; paths: string[] } | null
      /** The colour each agent type outside Claude Code's own was given when first seen, by lower-case bare type. */
      typeColors: Record<string, string>
    }
  }
}
