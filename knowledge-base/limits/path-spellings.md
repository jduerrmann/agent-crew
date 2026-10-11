---
type: limit
area: windows
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# One file arrives under several path spellings

**Why:**
- **Case:** the Windows file system ignores case, so `Src/a.ts` and `src/a.ts` are one file, and they showed up as two folders.
- **Git Bash:** Git Bash writes `/c/Projects/…` where tools write `C:\Projects\…`.
- **Packaged app:** the Claude desktop app is a Windows Store package. Windows quietly redirects `AppData\Roaming` to `AppData\Local\Packages\Claude_…\LocalCache`, so git's absolute top level differs from the paths in tool calls. Every file under AppData was listed twice.

**Workaround:**
- Keys are case-folded only when `OS` is `Windows_NT`, and folders that differ only in case merge in the tree.
- `/x/` paths become `X:/` only on Windows. On Unix `/a/project` is a real folder; converting it there broke paths.
- The repository root is derived from the cwd with `git rev-parse --show-cdup`, never from git's absolute top level (commit 1bd7233).

See `hooks/files.ts` (normalising) and `types/index.d.ts` (the folded key).

**Known gap, left on purpose:** on macOS and Linux, a file outside the repository such as `/etc/hosts` lands in a repo folder `etc/` of the same name. A clean fix touches five places, and Windows is not affected. Planned in [posix-absolute-paths](../plans/backlog/posix-absolute-paths.md).

**Re-check when:** never. This is how the platforms behave.
