---
type: limit
area: git
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# Some of git's answers look like real states but aren't

**Why:** reading the tree through `git` has traps that look like real states:
- **Empty repository:** `HEAD` is empty (`## No commits yet`), and the first commit has no parent to diff against.
- **Failed call:** a git call that fails or times out returns nothing, which looks like an empty repository. Booked as one, every file would count as committed.
- **Moves of HEAD:** a checkout, reset or rebase moves `HEAD` without a commit.
- **Renames and copies:** they carry a second NUL-separated path in the porcelain output.
- **Branch names:** they may contain single dots, never `..`.

**Workaround:**
- The first commit's files are listed with `ls-tree`.
- A failed call keeps the last state.
- `merge-base --is-ancestor` decides whether a move of `HEAD` was a commit.
- A commit whose files can't be listed is kept for the next look.
- Git runs with `--no-optional-locks`, `GIT_OPTIONAL_LOCKS=0` and an 8 s timeout, so it never blocks the person's own git.

See `hooks/register.tsx` (git sync) and `hooks/files.ts` (porcelain parsing).

**Re-check when:** never. Keep these cases in mind when touching the git sync, and add a test for each new one.
