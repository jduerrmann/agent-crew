// Installing a new version into a marketplace install: which Claude Code to ask,
// and the two commands it runs. `$.process.run` starts a command without a shell,
// so a bare `claude` finds neither the npm shim on Windows (`claude.cmd`) nor the
// Claude Code the desktop app brings along, which is not on the PATH. Every way
// in is tried with `--version` first, and the first that answers runs the update.
// Pure: register.tsx hands in the engine's calls, the tests their own.

/** What a command left behind, as `$.process.run` resolves it. */
export type RunResult = { exitCode: number; stdout: string; stderr: string }
/** Runs an argument vector; rejects when the command cannot start. */
export type Run = (argv: string[], timeoutMs: number) => Promise<RunResult>
/** A folder's entries; rejects when it is missing. */
export type List = (dir: string) => Promise<{ name: string; kind: string }[]>

export const PLUGIN_ID = 'agent-crew@agent-crew'
const MARKETPLACE = 'agent-crew'

/** What brings a marketplace install up to date, after the command that starts Claude Code. */
export const UPDATE_STEPS: readonly (readonly string[])[] = [
  ['plugin', 'marketplace', 'update', MARKETPLACE],
  ['plugin', 'update', PLUGIN_ID],
]

/** The same steps as a person types them in a terminal. */
export const UPDATE_BY_HAND: readonly string[] = UPDATE_STEPS.map(step => ['claude', ...step].join(' '))

const PROBE_MS = 15_000
const STEP_MS = 120_000

const hasClaudeExe = (entries: { name: string; kind: string }[]) =>
  entries.some(e => e.kind === 'file' && e.name.toLowerCase() === 'claude.exe')

/**
 * The Claude Code binaries the Claude desktop app on Windows keeps for `version`.
 *
 * The app keeps a folder per version under its data folder, the binary in it or
 * in a build folder beneath: `%LOCALAPPDATA%\Claude-Data\<app id>\claude-code\
 * <version>\<build>\claude.exe` now, `%APPDATA%\Claude\claude-code\<version>\` before.
 */
export async function bundledClaude(list: List, localAppData: string, appData: string, version: string): Promise<string[]> {
  const dataDirs: string[] = []
  if (localAppData) {
    const apps = await list(`${localAppData}/Claude-Data`).catch(() => [])
    for (const app of apps) if (app.kind === 'dir') dataDirs.push(`${localAppData}/Claude-Data/${app.name}`)
  }
  if (appData) dataDirs.push(`${appData}/Claude`)
  const found: string[] = []
  for (const data of dataDirs) {
    const dir = `${data}/claude-code/${version}`
    const entries = await list(dir).catch(() => [])
    if (hasClaudeExe(entries)) found.push(`${dir}/claude.exe`)
    for (const build of entries) {
      if (build.kind === 'dir' && hasClaudeExe(await list(`${dir}/${build.name}`).catch(() => []))) found.push(`${dir}/${build.name}/claude.exe`)
    }
  }
  return found
}

/**
 * The ways to start Claude Code's CLI, the likeliest first: the desktop app's own
 * binaries, `claude` on the PATH, the native installer's place in the home folder,
 * and on Windows `cmd`, which also finds the npm shim `claude.cmd`.
 */
export function launchers(isWindows: boolean, home: string, bundled: string[]): string[][] {
  const native = (p: string) => (isWindows ? p.replace(/\//g, '\\') : p)
  return [
    ...bundled.map(p => [native(p)]),
    ['claude'],
    ...(home ? [[native(`${home}/.local/bin/claude${isWindows ? '.exe' : ''}`)]] : []),
    ...(isWindows ? [['cmd.exe', '/d', '/s', '/c', 'claude']] : []),
  ]
}

/** The first launcher whose `--version` answers as Claude Code does. */
export async function findLauncher(candidates: string[][], run: Run): Promise<string[] | undefined> {
  for (const launcher of candidates) {
    try {
      const r = await run([...launcher, '--version'], PROBE_MS)
      if (r.exitCode === 0 && /\(Claude Code\)/.test(r.stdout)) return launcher
    } catch {
      // Not there, or not startable without a shell: the next one.
    }
  }
  return undefined
}

/**
 * Runs the update steps with the first launcher that starts. Resolves `{}` once
 * both went through, `{ error }` with the first failure's first line, or
 * `{ isMissing: true }` when no Claude Code could be started at all.
 */
export async function installUpdate(candidates: string[][], run: Run): Promise<{ error?: string; isMissing?: true }> {
  const launcher = await findLauncher(candidates, run)
  if (!launcher) return { isMissing: true }
  for (const step of UPDATE_STEPS) {
    try {
      const r = await run([...launcher, ...step], STEP_MS)
      if (r.exitCode !== 0) return { error: (r.stderr.trim() || r.stdout.trim()).split('\n')[0]?.trim() || `exit ${r.exitCode}` }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }
  return {}
}
