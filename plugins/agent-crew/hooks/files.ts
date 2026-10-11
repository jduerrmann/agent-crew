// Paths, shell-command reading and git output parsing for the files section.
// The command splitting and reader detection follow filetree's hooks/git.ts
// (Kurt Buhler, MIT): https://github.com/data-goblin/claude-code-filetree

import type { CrewGit, CrewGitFile } from '../types'

// --- paths: everything is kept with forward slashes and an upper-case drive.

// Git Bash spells `C:\` as `/c/`; read back only where there are drives, since
// elsewhere `/a/project` is just a folder.
let hasDrives = false
export const useDrives = (on: boolean): void => {
  hasDrives = on
}

export const posix = (p: string): string =>
  (hasDrives ? p.replace(/\\/g, '/').replace(/^\/([A-Za-z])(\/|$)/, (_, d: string) => `${d.toUpperCase()}:/`) : p.replace(/\\/g, '/'))
    .replace(/^([a-z]):/, (_, d: string) => `${d.toUpperCase()}:`)
    .replace(/(.)\/+$/, '$1')

export const isAbsolute = (p: string): boolean => p.startsWith('/') || /^[A-Za-z]:\//.test(p)

export function resolve(cwd: string, p: string, home = ''): string {
  let path = posix(p)
  if (home && (path === '~' || path.startsWith('~/'))) path = home + path.slice(1)
  const drive = /^[A-Za-z]:\//.test(path) ? path.slice(0, 2) : ''
  const parts = isAbsolute(path) ? [drive] : posix(cwd).split('/')
  for (const seg of path.slice(drive.length).split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      if (parts.length > 1) parts.pop()
    } else parts.push(seg)
  }
  const out = parts.join('/')
  return out === '' ? '/' : /^[A-Za-z]:$/.test(out) ? `${out}/` : out
}

export const inside = (root: string, path: string, fold: boolean): boolean => {
  const r = fold ? root.toLowerCase() : root
  const p = fold ? path.toLowerCase() : path
  return p === r || p.startsWith(r.endsWith('/') ? r : `${r}/`)
}

/** The key a path is stored under: case-folded where the file system folds case. */
export const keyOf = (path: string, fold: boolean): string => (fold ? posix(path).toLowerCase() : posix(path))

// --- shell commands.

function segments(command: string): string[][] {
  const out: string[][] = []
  let cur: string[] = []
  let tok = ''
  let quote = ''
  let has = false
  const endTok = () => {
    if (has) cur.push(tok)
    tok = ''
    has = false
  }
  const endSeg = () => {
    endTok()
    if (cur.length) out.push(cur)
    cur = []
  }
  for (let i = 0; i < command.length; i++) {
    const ch = command[i] ?? ''
    if (quote) {
      if (ch === quote) quote = ''
      else tok += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      has = true
    } else if (ch === ' ' || ch === '\t') endTok()
    else if (ch === '\n' || ch === ';' || ch === '|' || (ch === '&' && command[i - 1] !== '>' && command[i + 1] !== '>')) {
      if (command[i + 1] === ch) i++
      endSeg()
    } else {
      tok += ch
      has = true
    }
  }
  endSeg()
  return out
}

const READERS = new Set(['rg', 'grep', 'egrep', 'fgrep', 'cat', 'head', 'tail', 'bat', 'less', 'more', 'wc', 'sed', 'awk', 'jq', 'Get-Content', 'gc', 'type'])
const PATTERN_FIRST = new Set(['rg', 'grep', 'egrep', 'fgrep', 'sed', 'awk', 'jq'])
const LISTS_FILES = new Set(['rg', 'grep', 'egrep', 'fgrep'])

// Options that take the next word as their value, per reader: `-n` does for
// head, but numbers lines for grep and silences sed.
const GREP_VALUED = /^-(e|f|m|A|B|C|-regexp|-file|-max-count|-after-context|-before-context|-context)$/
const CONTENT_VALUED = /^-(TotalCount|Head|First|Tail|Last|Encoding|Delimiter|ReadCount)$/i
const VALUED: Record<string, RegExp> = {
  rg: /^-(e|f|g|t|T|m|A|B|C|M|j|-regexp|-file|-glob|-iglob|-type|-type-not|-max-count|-after-context|-before-context|-context|-max-columns|-threads)$/,
  grep: GREP_VALUED,
  egrep: GREP_VALUED,
  fgrep: GREP_VALUED,
  head: /^-(n|c|-lines|-bytes)$/,
  tail: /^-(n|c|s|-lines|-bytes|-sleep-interval|-pid)$/,
  sed: /^-(e|f|l|-expression|-file|-line-length)$/,
  awk: /^-(f|v|F)$/,
  jq: /^-(f|-from-file|-indent)$/,
  bat: /^-(l|H|r|-language|-highlight-line|-line-range|-theme|-style)$/,
  'Get-Content': CONTENT_VALUED,
  gc: CONTENT_VALUED,
}

const valuesOf = (head: string, option: string): number =>
  head === 'jq' && /^--(arg|argjson|slurpfile|rawfile)$/.test(option) ? 2 : VALUED[head]?.test(option) ? 1 : 0

// A pattern or script given by option leaves no positional one to skip.
const givesScript = (head: string, option: string): boolean =>
  head === 'jq' ? /^-(f|-from-file)$/.test(option) : /^-(e|f|-regexp|-file|-expression)$/.test(option)

// A path that names a file rather than a folder, as far as its spelling tells.
const looksLikeFile = (p: string): boolean => /[^/]\.[A-Za-z0-9]{1,8}$/.test(p) && !/[*?<>|$]/.test(p)

/** Files a shell command reads: cat/head/sed/rg arguments, and the paths rg -l / grep -l print. */
export function readTargets(command: string, sessionCwd: string, stdout: string, home = ''): string[] {
  let cwd = sessionCwd
  const out = new Set<string>()
  let listsPaths = false
  for (const raw of segments(command)) {
    const tokens = raw.filter(t => !/^[A-Z_][A-Z0-9_]*=/.test(t))
    const head = tokens[0]?.split('/').pop() ?? ''
    if ((head === 'cd' || head === 'Set-Location') && tokens[1]) {
      cwd = resolve(cwd, tokens[1], home)
      continue
    }
    if (!READERS.has(head)) continue
    if (head === 'sed' && tokens.some(t => /^-i/.test(t))) continue
    if (LISTS_FILES.has(head) && tokens.some(t => /^-(l|-files-with-matches|-files)$/.test(t))) listsPaths = true
    const args = tokens.slice(1)
    let skipPattern = PATTERN_FIRST.has(head) && !args.some(t => givesScript(head, t))
    for (let i = 0; i < args.length; i++) {
      const a = args[i] ?? ''
      if (a.startsWith('-')) {
        i += valuesOf(head, a)
        continue
      }
      if (skipPattern) {
        skipPattern = false
        continue
      }
      if (looksLikeFile(a)) out.add(resolve(cwd, a, home))
    }
  }
  if (listsPaths) {
    for (const line of stdout.split('\n').slice(0, 200)) {
      const path = posix(line.trim()).match(/^((?:[A-Za-z]:)?[^:\0]+?)(?::\d+[:-]|$|:)/)?.[1]?.trim()
      if (path && looksLikeFile(path)) out.add(resolve(cwd, path, home))
    }
  }
  return [...out].slice(0, 40)
}

/** Whether a command can change the repository or the working tree: anything but plain readers. */
export function mayChange(command: string): boolean {
  if (/[^>]>[^>&]|>>/.test(` ${command}`.replace(/\d*>&\d/g, ' ').replace(/(\d*|&)>>?\s*\/dev\/null/g, ' '))) return true
  return segments(command).some(raw => {
    const head = raw[0]?.split('/').pop() ?? ''
    if (head === 'git') return !/^(status|log|diff|show|blame|rev-parse|ls-files|grep|describe|remote|reflog|branch)$/.test(raw[1] ?? '')
    return !(READERS.has(head) || /^(cd|ls|echo|pwd|find|fd|tree|which|printf|true|Get-ChildItem|Select-String)$/.test(head))
  })
}

// --- git output.

/** `git status --porcelain=v1 -b -z`: the branch line, then one entry per path. */
export function parseStatus(raw: string, root: string): Pick<CrewGit, 'branch' | 'upstream' | 'ahead' | 'behind'> & { files: Record<string, CrewGitFile> } {
  const parts = raw.split('\0')
  const files: Record<string, CrewGitFile> = {}
  let branch = ''
  let upstream = ''
  let ahead = 0
  let behind = 0
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i] ?? ''
    if (!entry) continue
    if (entry.startsWith('## ')) {
      // A branch may hold single dots (`release/0.3`), never `..`.
      const m = /^## (?:No commits yet on )?(\S+?)(?:\.\.\.(\S+))?(?=\s|$)(?: \[(.*)\])?/.exec(entry)
      branch = m?.[1] ?? ''
      upstream = m?.[2] ?? ''
      ahead = Number(/ahead (\d+)/.exec(m?.[3] ?? '')?.[1] ?? 0)
      behind = Number(/behind (\d+)/.exec(m?.[3] ?? '')?.[1] ?? 0)
      continue
    }
    const xy = entry.slice(0, 2)
    const rel = entry.slice(3)
    if (xy[0] === 'R' || xy[0] === 'C') i++ // the original path follows
    if (xy === '!!' || rel.endsWith('/')) continue
    files[`${root}/${rel}`] = { path: `${root}/${rel}`, code: xy, add: 0, del: 0 }
  }
  return { branch, upstream, ahead, behind, files }
}

/** `git diff HEAD --numstat -z`: added and deleted lines per path. */
export function applyNumstat(raw: string, root: string, files: Record<string, CrewGitFile>): void {
  const parts = raw.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const m = /^(-|\d+)\t(-|\d+)\t(.*)$/.exec(parts[i] ?? '')
    if (!m) continue
    let rel = m[3] ?? ''
    if (!rel) {
      i += 2 // a rename: old path, then new path
      rel = parts[i] ?? ''
    }
    const path = `${root}/${rel}`
    const f = files[path] ?? { path, code: ' M', add: 0, del: 0 }
    files[path] = { ...f, add: m[1] === '-' ? 0 : Number(m[1]), del: m[2] === '-' ? 0 : Number(m[2]) }
  }
}

// --- versions.

/** Whether `a` is a later version than `b`, by their dotted numbers (`0.10.0` > `0.9.2`). */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split(/[.+-]/).map(n => Number.parseInt(n, 10) || 0)
  const pb = b.split(/[.+-]/).map(n => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d > 0
  }
  return false
}

/** The raw URL of a file on a GitHub repository's default branch, from the manifest's `repository`. */
export function rawGithubUrl(repository: string, path: string): string | undefined {
  const m = /github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/.exec(repository.trim())
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/HEAD/${path}` : undefined
}

// --- opening a file in the app the system gives its kind, after filetree's
// hooks/open.ts. On Windows the path travels in the environment, never quoted.

const WIN_OPEN =
  "$ErrorActionPreference = 'Stop'; [Diagnostics.Process]::Start([Diagnostics.ProcessStartInfo]@{ FileName = $env:CREW_OPEN_TARGET; UseShellExecute = $true }) | Out-Null"

export function openCommand(os: 'linux' | 'darwin' | 'win32', path: string): { argv: string[]; env?: Record<string, string> } {
  if (os === 'win32') return { argv: ['powershell', '-NoProfile', '-NonInteractive', '-Command', WIN_OPEN], env: { CREW_OPEN_TARGET: path.replace(/\//g, '\\') } }
  if (os === 'darwin') return { argv: ['open', '--', path] }
  return { argv: ['sh', '-c', 'setsid -f xdg-open "$1" </dev/null >/dev/null 2>&1', 'sh', path] }
}

// --- the files section as a tree.

export type TreeRow = {
  /** Folder rows carry the folded chain (`hooks/sub`); file rows their name. */
  name: string
  depth: number
  isDir: boolean
  key: string
}

type Node = { name: string; key: string; dirs: Map<string, Node>; files: { name: string; key: string }[] }

/** Folders first, then files, alphabetically; a folder with one sub-folder and no files folds into it. */
export function treeRows(entries: { key: string; label: string }[]): TreeRow[] {
  const root: Node = { name: '', key: '', dirs: new Map(), files: [] }
  for (const e of entries) {
    const segs = e.label.split('/').filter(Boolean)
    let node = root
    for (const seg of segs.slice(0, -1)) {
      let next = node.dirs.get(seg)
      if (!next) {
        next = { name: seg, key: `${node.key}/${seg}`, dirs: new Map(), files: [] }
        node.dirs.set(seg, next)
      }
      node = next
    }
    node.files.push({ name: segs.at(-1) ?? e.label, key: e.key })
  }
  const rows: TreeRow[] = []
  const walk = (node: Node, depth: number) => {
    for (const dir of [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      let d = dir
      let name = d.name
      while (d.files.length === 0 && d.dirs.size === 1) {
        const only = [...d.dirs.values()][0]
        if (!only) break
        d = only
        name += `/${d.name}`
      }
      rows.push({ name, depth, isDir: true, key: `dir:${d.key}` })
      walk(d, depth + 1)
    }
    for (const f of [...node.files].sort((a, b) => a.name.localeCompare(b.name))) rows.push({ name: f.name, depth, isDir: false, key: f.key })
  }
  walk(root, 0)
  return rows
}

/** The entries under `folder` (a tree path such as `src/auth`), labelled relative to it; `''` keeps them all. */
export function underFolder<V extends { label: string }>(entries: V[], folder: string): V[] {
  if (!folder) return entries
  const pre = `${folder}/`
  return entries.flatMap(v => {
    const label = v.label.replace(/^\//, '')
    return label.startsWith(pre) ? [{ ...v, label: label.slice(pre.length) }] : []
  })
}

/** The tree of a folder's entries, its folders keyed by their whole path (`dir:/src/auth`). */
export function rowsUnder(entries: { key: string; label: string }[], folder: string): TreeRow[] {
  const rows = treeRows(entries)
  return folder ? rows.map(r => (r.isDir ? { ...r, key: `dir:/${folder}${r.key.slice('dir:'.length)}` } : r)) : rows
}

/** The keys of the folders a label sits in, as `rowsUnder` keys them: what must be open to show it. */
export function folderKeys(label: string, folder: string): string[] {
  const segs = label.split('/').filter(Boolean).slice(0, -1)
  const pre = folder ? [folder] : []
  return segs.map((_, i) => `dir:/${[...pre, ...segs.slice(0, i + 1)].join('/')}`)
}

/** The tree path a folder row stands for: `dir:/src/auth` is `src/auth`. */
export const folderOf = (key: string): string => key.replace(/^dir:\/?/, '')

/** The rows a reader sees: nothing beneath a folder that is shut. */
export function visibleRows(rows: TreeRow[], shut: ReadonlySet<string>): TreeRow[] {
  const out: TreeRow[] = []
  let hideBelow = -1
  for (const r of rows) {
    if (hideBelow >= 0 && r.depth > hideBelow) continue
    hideBelow = r.isDir && shut.has(r.key) ? r.depth : -1
    out.push(r)
  }
  return out
}
