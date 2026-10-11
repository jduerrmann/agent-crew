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

// Files without an extension that are files all the same.
const NAMED_FILES = /(^|\/)(Makefile|GNUmakefile|Dockerfile|Containerfile|Gemfile|Rakefile|Procfile|Justfile|Vagrantfile|Brewfile|LICENSE|LICENCE|COPYING|NOTICE|README|CHANGELOG|AUTHORS|CODEOWNERS)$/

// A path that names a file rather than a folder, as far as its spelling tells:
// a name with an extension, a dotfile (`.gitignore`), or a well-known name.
const looksLikeFile = (p: string): boolean =>
  !/[*?<>|$]/.test(p) && (/[^/]\.[A-Za-z0-9]{1,8}$/.test(p) || /(^|\/)\.[A-Za-z0-9][\w.-]*$/.test(p) || NAMED_FILES.test(p))

// Words that run the command after them: `sudo cat a`, `env FOO=1 cat a`, `time cat a`.
const WRAPPERS = new Set(['sudo', 'env', 'command', 'time', 'nohup', 'exec', 'builtin', 'nice'])

/** A segment's words without its environment prefixes and wrappers: the command itself first. */
function commandWords(raw: string[]): string[] {
  // Assignments only at the front: `awk -v n=3` keeps its own.
  const dropAssignments = (w: string[]) => {
    let i = 0
    while (i < w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[i] ?? '')) i++
    return w.slice(i)
  }
  let words = dropAssignments(raw)
  while (words.length && WRAPPERS.has(words[0]?.split('/').pop() ?? '')) {
    const wrapper = words[0]
    words = words.slice(1)
    // Their own options (`sudo -u root`, `nice -n 10`), and env's assignments.
    while (words[0]?.startsWith('-')) words = words.slice(wrapper === 'sudo' || wrapper === 'nice' ? (/^-[ugCn]$/.test(words[0]) ? 2 : 1) : 1)
    words = dropAssignments(words)
  }
  return words
}

// A redirection, alone (`>`, `2>>`, `<`) or with its target attached (`2>err.log`, `<a.ts`).
const REDIRECT = /^(\d*|&)(>>?|<)(&\d+)?$/
const REDIRECT_ATTACHED = /^(\d*|&)(>>?|<)(?!&)(.+)$/

// Options whose value is a file the command reads: a script, a pattern list.
const FILE_VALUED: Record<string, RegExp> = {
  awk: /^-f$/,
  sed: /^(-f|--file)$/,
  jq: /^(-f|--from-file)$/,
  grep: /^(-f|--file)$/,
  rg: /^(-f|--file)$/,
}

/** Files a shell command reads: cat/head/sed/rg arguments, and the paths rg -l / grep -l print. */
export function readTargets(command: string, sessionCwd: string, stdout: string, home = ''): string[] {
  let cwd: string | undefined = sessionCwd
  const out = new Set<string>()
  let listsPaths = false
  const add = (p: string) => {
    // After `cd -` or `popd` the folder is unknown: only absolute paths still say where.
    if (cwd !== undefined || isAbsolute(posix(p)) || p.startsWith('~')) out.add(resolve(cwd ?? '/', p, home))
  }
  for (const raw of segments(command)) {
    const tokens = commandWords(raw)
    const head = tokens[0]?.split('/').pop() ?? ''
    if (head === 'cd' || head === 'Set-Location' || head === 'pushd') {
      const to = tokens.slice(1).find(t => !t.startsWith('-') || t === '-')
      if (to === '-' || (head === 'pushd' && !to)) cwd = undefined
      else if (to && cwd !== undefined) cwd = resolve(cwd, to, home)
      else if (to && (isAbsolute(posix(to)) || to.startsWith('~'))) cwd = resolve('/', to, home)
      else if (!to && home) cwd = home
      continue
    }
    if (head === 'popd') {
      cwd = undefined
      continue
    }
    if (!READERS.has(head)) continue
    if (head === 'sed' && tokens.some(t => /^-[a-zA-Z]*i/.test(t) || t.startsWith('--in-place'))) continue
    // -l among combined flags (`-rl`, `-rnl`) too: the output is a list of paths.
    if (LISTS_FILES.has(head) && tokens.some(t => /^-[A-Za-z]*l[A-Za-z]*$/.test(t) || /^--(files-with-matches|files)$/.test(t))) listsPaths = true
    const args = tokens.slice(1)
    let skipPattern = PATTERN_FIRST.has(head) && !args.some(t => givesScript(head, t))
    for (let i = 0; i < args.length; i++) {
      const a = args[i] ?? ''
      // A redirection's target is written or fed in, never an argument: `< a.ts` is read.
      if (REDIRECT.test(a)) {
        const target = args[i + 1]
        if (a.endsWith('<') && target && looksLikeFile(target)) add(target)
        i++
        continue
      }
      const attached = REDIRECT_ATTACHED.exec(a)
      if (attached) {
        if (attached[2] === '<' && attached[3] && looksLikeFile(attached[3])) add(attached[3])
        continue
      }
      if (a.startsWith('-')) {
        const value = args[i + 1]
        if (FILE_VALUED[head]?.test(a) && value && looksLikeFile(value)) add(value)
        i += valuesOf(head, a)
        continue
      }
      if (skipPattern) {
        skipPattern = false
        continue
      }
      if (looksLikeFile(a)) add(a)
    }
  }
  if (listsPaths) {
    for (const line of stdout.split('\n').slice(0, 200)) {
      const path = posix(line.trim()).match(/^((?:[A-Za-z]:)?[^:\0]+?)(?::\d+[:-]|$|:)/)?.[1]?.trim()
      if (path && looksLikeFile(path)) add(path)
    }
  }
  return [...out].slice(0, 40)
}

// Commands that only look: they change neither the tree nor the repository.
const LOOKERS = /^(cd|pushd|popd|ls|echo|pwd|find|fd|tree|which|printf|true|false|test|\[|sort|uniq|diff|cmp|stat|file|du|df|date|cut|tr|nl|column|basename|dirname|realpath|readlink|whoami|uname|hostname|id|seq|yes|head|tail|wc|rev|fold|expand|comm|join|paste|md5sum|sha1sum|sha256sum|Get-ChildItem|Select-String|Get-Item|Get-Location|Test-Path|Resolve-Path|Get-Command|Select-Object|Measure-Object|Where-Object|Sort-Object|Format-Table|Format-List|Out-Null|Out-String|Write-Output|Write-Host)$/

// git's read-only subcommands; branch, remote, stash and config are read-only only while they list.
const GIT_LOOKS = /^(status|log|diff|show|blame|rev-parse|ls-files|ls-tree|grep|describe|reflog|shortlog|ls-remote|cat-file|rev-list|merge-base|show-ref|for-each-ref|name-rev|count-objects|var|version|help|whatchanged)$/

/** git's subcommand and its words, past the global options (`--no-pager`, `-C dir`, `-c k=v`). */
function gitCommand(words: string[]): [string, string[]] {
  let i = 1
  while (i < words.length) {
    const w = words[i] ?? ''
    if (w === '-C' || w === '-c' || w === '--git-dir' || w === '--work-tree' || w === '--namespace') i += 2
    else if (w.startsWith('-')) i += 1
    else break
  }
  return [words[i] ?? '', words.slice(i + 1)]
}

function gitChanges(words: string[]): boolean {
  const [sub, rest] = gitCommand(words)
  if (!sub) return false
  // branch and remote read only while they list: `branch -m`, `remote update` change things.
  if (sub === 'branch')
    return !rest.every(t => /^(-a|-r|-v|-vv|-l|--all|--remotes|--list|--verbose|--show-current|--contains|--merged|--no-merged|--sort=.*|--format=.*|--color.*|--no-color)$/.test(t) || rest.includes('--list'))
  if (sub === 'remote') return !(rest.length === 0 || rest.every(t => t === '-v' || t === '--verbose') || rest[0] === 'show' || rest[0] === 'get-url')
  if (sub === 'stash') return !(rest[0] === 'list' || rest[0] === 'show')
  if (sub === 'config') return !rest.some(t => /^(--get|--get-all|--get-regexp|--list|-l)$/.test(t))
  if (sub === 'diff' || sub === 'log' || sub === 'show') return rest.some(t => t.startsWith('--output'))
  return !GIT_LOOKS.test(sub)
}

/** Whether a command can change the repository or the working tree: anything but plain readers. */
export function mayChange(command: string): boolean {
  // Redirections into a file write; quoted text (`awk '$1 > 3'`, `echo "a > b"`) and the
  // null devices (`2>/dev/null`, `2>$null`, `> NUL`) do not.
  const bare = ` ${command}`
    .replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, "''")
    .replace(/\d*>&\d/g, ' ')
    .replace(/(\d*|&)>>?\s*(\/dev\/null|\$null|NUL)(?![\w/.])/gi, ' ')
  if (/[^>]>[^>&]|>>/.test(bare)) return true
  return segments(command).some(raw => {
    const words = commandWords(raw)
    const head = words[0]?.split('/').pop() ?? ''
    if (!head) return false
    if (head === 'git') return gitChanges(words)
    // Readers and finders that write all the same: in place, or by what they run.
    if (head === 'sed' && words.some(t => /^-[a-zA-Z]*i/.test(t) || t.startsWith('--in-place'))) return true
    if ((head === 'awk' || head === 'gawk') && words.includes('inplace')) return true
    if (head === 'find' && words.some(t => /^-(delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$/.test(t))) return true
    if (head === 'fd' && words.some(t => /^(-x|-X|--exec|--exec-batch)(=|$)/.test(t))) return true
    if (head === 'sort' && words.some(t => /^(-o|--output)(=|$)/.test(t) || /^-[A-Za-z]*o$/.test(t))) return true
    if (head === 'uniq' && words.slice(1).filter(t => !t.startsWith('-')).length > 1) return true
    return !(READERS.has(head) || LOOKERS.test(head))
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
    // A rename or copy, staged or not (`git add -N` then a move): the original path follows.
    if (/[RC]/.test(xy)) i++
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

/**
 * Whether `a` is a later version than `b`, as semver orders them: the dotted
 * numbers first (`0.10.0` > `0.9.2`); at a tie a release outranks its
 * pre-releases (`1.0.0` > `1.0.0-beta.1`), which compare part by part, numbers
 * below words; build metadata after `+` counts for nothing.
 */
export function isNewer(a: string, b: string): boolean {
  return compareVersions(a, b) > 0
}

export function compareVersions(a: string, b: string): number {
  const split = (v: string) => {
    const [core = '', pre] = v.trim().replace(/^v/, '').split('+')[0]?.split(/-(.*)/s) ?? []
    return { nums: core.split('.').map(n => Number.parseInt(n, 10) || 0), pre: pre ? pre.split('.') : [] }
  }
  const va = split(a)
  const vb = split(b)
  for (let i = 0; i < Math.max(va.nums.length, vb.nums.length, 3); i++) {
    const d = (va.nums[i] ?? 0) - (vb.nums[i] ?? 0)
    if (d) return Math.sign(d)
  }
  if (!va.pre.length || !vb.pre.length) return va.pre.length === vb.pre.length ? 0 : va.pre.length ? -1 : 1
  for (let i = 0; i < Math.max(va.pre.length, vb.pre.length); i++) {
    const x = va.pre[i]
    const y = vb.pre[i]
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1
    if (x === y) continue
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) return Math.sign(Number(x) - Number(y))
    if (nx !== ny) return nx ? -1 : 1
    return x < y ? -1 : 1
  }
  return 0
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
// `fold`: where the file system folds case (Windows), `Src` and `src` are one folder,
// keyed in lower case and named as first seen.
export function treeRows(entries: { key: string; label: string }[], fold = false): TreeRow[] {
  const root: Node = { name: '', key: '', dirs: new Map(), files: [] }
  for (const e of entries) {
    const segs = e.label.split('/').filter(Boolean)
    let node = root
    for (const seg of segs.slice(0, -1)) {
      const id = fold ? seg.toLowerCase() : seg
      let next = node.dirs.get(id)
      if (!next) {
        next = { name: seg, key: `${node.key}/${id}`, dirs: new Map(), files: [] }
        node.dirs.set(id, next)
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
export function underFolder<V extends { label: string }>(entries: V[], folder: string, fold = false): V[] {
  if (!folder) return entries
  const pre = fold ? `${folder}/`.toLowerCase() : `${folder}/`
  return entries.flatMap(v => {
    const label = v.label.replace(/^\//, '')
    return (fold ? label.toLowerCase() : label).startsWith(pre) ? [{ ...v, label: label.slice(pre.length) }] : []
  })
}

/** The tree of a folder's entries, its folders keyed by their whole path (`dir:/src/auth`). */
export function rowsUnder(entries: { key: string; label: string }[], folder: string, fold = false): TreeRow[] {
  const rows = treeRows(entries, fold)
  return folder ? rows.map(r => (r.isDir ? { ...r, key: `dir:/${folder}${r.key.slice('dir:'.length)}` } : r)) : rows
}

/** The keys of the folders a label sits in, as `rowsUnder` keys them: what must be open to show it. */
export function folderKeys(label: string, folder: string, fold = false): string[] {
  const segs = label.split('/').filter(Boolean).slice(0, -1).map(seg => (fold ? seg.toLowerCase() : seg))
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
