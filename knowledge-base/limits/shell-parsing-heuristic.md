---
type: limit
area: other
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# Reads and writes in shell commands are guessed, not known

**Why:** a Bash or PowerShell call is just a string, so the files it reads or writes can only be guessed by parsing it. Only these tools name their files:
- `Read`
- `Grep`, through `result.filenames`, at most 20
- `Edit`, `Write` and `NotebookEdit`

**Workaround:** `readTargets` and `mayChange` in `hooks/files.ts` parse the common shapes, after filetree.
- Left out on purpose:
  - backslash escapes such as `my\ file.ts`, since they would break Windows paths in PowerShell
  - `|` inside quoted names
  - `( )` subshells
  - `$(…)`, heredocs, `xargs` and `$HOME/…`
- Not taken for files: globs, and names without an extension unless they are on a known list (`Makefile`, `LICENSE` …).
- After `cd -` or `popd` the cwd is unknown, so only absolute paths count.
- Each command is capped at 40 paths and 200 lines of stdout.
- `mayChange` is conservative. Anything not known to only read counts as a possible change and triggers a git read. Shell writes are never attributed to a file; git reports them.

The cases are tabled in `tests/shell.test.ts`, which grew out of a stress test with 287 commands.

**Re-check when:** the host reports file access per command.
