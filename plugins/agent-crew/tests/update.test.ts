import { expect, test } from 'claude-code/testing'
import { UPDATE_BY_HAND, bundledClaude, installUpdate, launchers } from '../hooks/update'
import type { List, Run, RunResult } from '../hooks/update'

// A machine as the update sees it: `answer` says what a command prints, or
// undefined when it cannot start (no shell finds it); every call is recorded.
function machine(answer: (argv: string[]) => Partial<RunResult> | undefined) {
  const calls: string[][] = []
  const run: Run = async argv => {
    calls.push(argv)
    const r = answer(argv)
    if (!r) throw new Error(`spawn ${argv[0]} ENOENT`)
    return { exitCode: 0, stdout: '', stderr: '', ...r }
  }
  return { calls, run }
}

// A folder tree for `$.fs.list`: each folder's path and its entries.
const tree = (dirs: Record<string, [string, 'file' | 'dir'][]>): List => async dir => {
  const entries = dirs[dir]
  if (!entries) throw new Error(`ENOENT ${dir}`)
  return entries.map(([name, kind]) => ({ name, kind }))
}

const VERSION = { stdout: '2.1.321 (Claude Code)\n' }
const isProbe = (argv: string[]) => argv[argv.length - 1] === '--version'

test('on Windows a bare claude that cannot start gives way to cmd, which finds the npm shim', async () => {
  const { calls, run } = machine(argv => (argv[0] === 'cmd.exe' ? (isProbe(argv) ? VERSION : {}) : undefined))
  const result = await installUpdate(launchers(true, 'C:/Users/u', []), run)
  expect(result).toEqual({})
  const steps = calls.filter(argv => !isProbe(argv))
  expect(steps).toEqual([
    ['cmd.exe', '/d', '/s', '/c', 'claude', 'plugin', 'marketplace', 'update', 'agent-crew'],
    ['cmd.exe', '/d', '/s', '/c', 'claude', 'plugin', 'update', 'agent-crew@agent-crew'],
  ])
})

test("the desktop app's own Claude Code for the session's version comes first", async () => {
  const local = 'C:/Users/u/AppData/Local'
  const roaming = 'C:/Users/u/AppData/Roaming'
  const list = tree({
    [`${local}/Claude-Data`]: [['claude_app', 'dir'], ['README.txt', 'file']],
    [`${local}/Claude-Data/claude_app/claude-code/2.1.321`]: [['d020', 'dir']],
    [`${local}/Claude-Data/claude_app/claude-code/2.1.321/d020`]: [['claude.exe', 'file']],
    [`${local}/Claude-Data/claude_app/claude-code/2.1.317`]: [['a33a', 'dir']],
    [`${local}/Claude-Data/claude_app/claude-code/2.1.317/a33a`]: [['claude.exe', 'file']],
    [`${roaming}/Claude/claude-code/2.1.321`]: [['claude.exe', 'file']],
  })
  const bundled = await bundledClaude(list, local, roaming, '2.1.321')
  expect(bundled).toEqual([`${local}/Claude-Data/claude_app/claude-code/2.1.321/d020/claude.exe`, `${roaming}/Claude/claude-code/2.1.321/claude.exe`])
  const ways = launchers(true, 'C:/Users/u', bundled)
  expect(ways[0]).toEqual(['C:\\Users\\u\\AppData\\Local\\Claude-Data\\claude_app\\claude-code\\2.1.321\\d020\\claude.exe'])
  expect(ways.slice(2)).toEqual([['claude'], ['C:\\Users\\u\\.local\\bin\\claude.exe'], ['cmd.exe', '/d', '/s', '/c', 'claude']])
  // It answers, so nothing else is tried.
  const { calls, run } = machine(argv => (argv[0] === ways[0]?.[0] ? (isProbe(argv) ? VERSION : {}) : undefined))
  expect(await installUpdate(ways, run)).toEqual({})
  expect(calls.every(argv => argv[0] === ways[0]?.[0])).toBe(true)
})

test('without a desktop app the search finds nothing and does not fail', async () => {
  expect(await bundledClaude(tree({}), 'C:/Users/u/AppData/Local', 'C:/Users/u/AppData/Roaming', '2.1.321')).toEqual([])
  expect(await bundledClaude(tree({}), '', '', '2.1.321')).toEqual([])
})

test('elsewhere: claude on the PATH, then the native installer in the home folder; no cmd', () => {
  expect(launchers(false, '/home/u', [])).toEqual([['claude'], ['/home/u/.local/bin/claude']])
})

test('when no Claude Code starts, no update step runs and it says so', async () => {
  // cmd starts, but finds no claude: it answers with an error, not a version.
  const { calls, run } = machine(argv => (argv[0] === 'cmd.exe' ? { exitCode: 1, stderr: 'Der Befehl "claude" ist entweder falsch geschrieben oder\r\nkonnte nicht gefunden werden.' } : undefined))
  expect(await installUpdate(launchers(true, 'C:/Users/u', []), run)).toEqual({ isMissing: true })
  expect(calls.every(isProbe)).toBe(true)
})

test("a failing step stops the update with its first line; a program that is not Claude Code is passed over", async () => {
  const { calls, run } = machine(argv => {
    // Some other `claude` on the PATH that knows no `--version` of Claude Code.
    if (argv[0] === 'claude') return { stdout: 'claude 1.0 (something else)\n' }
    if (argv[0] !== 'cmd.exe') return undefined
    if (isProbe(argv)) return VERSION
    return argv.includes('marketplace') ? { exitCode: 1, stderr: 'Failed to refresh marketplace\nat git fetch' } : {}
  })
  expect(await installUpdate(launchers(true, 'C:/Users/u', []), run)).toEqual({ error: 'Failed to refresh marketplace' })
  expect(calls.some(argv => argv.includes('agent-crew@agent-crew'))).toBe(false)
})

test('the commands to type by hand match what the button runs', () => {
  expect(UPDATE_BY_HAND).toEqual(['claude plugin marketplace update agent-crew', 'claude plugin update agent-crew@agent-crew'])
})
