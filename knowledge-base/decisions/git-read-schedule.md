---
type: decision
area: files
status: active
date: 2026-10-10
decided-by: agent
updated: 2026-10-11
---

# Git is read after changes and every ten seconds while the pane is open

**Context:** there is no event for changes outside the session ([no-outside-change-events](../limits/no-outside-change-events.md)), and a write needs a moment before git sees it.

**Decision:**
- Git is read 500 ms after a write or a command that may change the tree, when the pane opens, and every 10 s while it is open.
- No ↻ button: it only saved those 10 s for changes made outside the session, and the user had it removed.
- One read runs at a time, with at most one more queued.
- The open diff reloads on every read.

**Alternatives:** polling all the time, which costs processes with the pane closed. Reading only after tool calls, which misses outside commits.

**Consequences:** with the pane closed, outside changes appear late. Git must never block the user's own git ([git-edge-cases](../limits/git-edge-cases.md)).
