---
type: plan
area: files
status: active
priority: 6
effort: M
depends-on: conflict-window
created: 2026-10-11
updated: 2026-10-11
---

# An optional file lock stops a second agent from changing a file another is working on

**Goal:** the user wants this as a setting: instead of only warning after two agents changed the same file, refuse the second agent's write while the first is still at it.

**Why:** a conflict warning comes after the damage. With several agents on one codebase, a lock prevents it.

**Today:**
- [conflict-window](../../decisions/conflict-window.md): two writers on one file within 10 minutes is a conflict, until a commit. `touch` in `hooks/register.tsx` keeps `recentWrites` per file and raises the notice.
- The `tool.call` hook sees every call with its `agentId` before it runs (it calls `next(e)` first today). A hook can answer `{ deny: reason }` instead.

**Approach:**
1. Option `lockFiles` (default off) in the notifications group, beside `warnConflicts`.
2. In the `tool.call` hook, before `next(e)`, for `Edit`, `Write` and `NotebookEdit` with a `file_path`: find the file's `recentWrites`. If another agent wrote it within the window, since the last commit, and that agent is still running or idle, answer `{ deny: "… is being changed by <agent>; agent-crew's file lock …" }`.
3. Rules to settle with the user: the main chat is never locked out (it is the person's own hand)? A finished owner releases the lock. A commit releases it.
4. In the tree: a 🔒 in the owner's colour on a locked file, and the deny in the file's history (a new kind, `blocked`).
5. A notice when a write is refused, once per file and agent.
6. Shell writes can't be locked: their files are unknown ([shell-parsing-heuristic](../../limits/shell-parsing-heuristic.md)). Say so in the README.

**Options and text:** `lockFiles`; texts de/en for the deny reason, the notice and the history kind; both READMEs.

**Tests:** with the lock on, agent B's Edit on a file agent A wrote a minute ago is denied while A runs and allowed after A finishes or after a commit; the main chat is allowed; with the lock off nothing is denied.

**Risks and open questions:** a denied agent may retry or work around it (writing through Bash); check what it does with the reason. Never lock a file for the agent that holds it.

**Done when:** with *File lock* on, a second agent's edit of a file the first is changing is refused with a reason both the agent and the person can read.

**Afterwards:** a decision note on the lock's rules, superseding nothing ([conflict-window](../../decisions/conflict-window.md) stays for the warning); delete this plan.
