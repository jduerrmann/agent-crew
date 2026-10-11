---
type: limit
area: host-api
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# There is no event for changes made outside the session

**Why:** the mod sees tool calls, not the file system. A commit, checkout or edit made in another terminal or editor sends no event.

**Workaround:** git is read 500 ms after a write or a command that may change the tree, every 10 s while the pane is open, and on ↻ ([git-read-schedule](../decisions/git-read-schedule.md)). With the pane closed, outside changes appear on the next read.

**Re-check when:** the host offers a file or git watcher to mods.
