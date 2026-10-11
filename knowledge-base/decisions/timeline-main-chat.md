---
type: decision
area: agents
status: active
date: 2026-10-11
decided-by: user
supersedes:
updated: 2026-10-11
---

# The main chat has a row of its own in the timeline

**Context:** the timeline showed only subagents, so it never said when the main chat itself worked. The user asked for the main session in it.

**Decision:**
- Each turn of the main chat is a bar in one row at the top, in Claude's colour (`CLAY`), red when the turn failed or was refused, faint when interrupted.
- A turn runs from `turn.start` to the `turn.complete` without an `agentId`. Only the main loop raises `turn.start`; a subagent's run begins with its spawn. A turn whose end was never heard ends where the next one begins.
- The turns are kept in `mainTurns`, the newest 200 ([store-json-4mib](../limits/store-json-4mib.md)). They join the axis, so a pause folds only when neither the main chat nor an agent worked.
- The timeline shows as soon as the main chat has a turn, without any subagent.
- While a turn runs, the pane redraws every five seconds so its bar grows.
- `timelineMain` (on) switches the row off ([configurable-sections](configurable-sections.md)). The turns join the axis either way (the user's call): otherwise an hour of work before the first subagent was missing, and the timeline started at 0:00 with it. Without the row and without a subagent there is nothing to draw, and the section stays away.

**Alternatives:** model requests (`turn.step`) as the main chat's activity: they leave out the time tools run, so the bar would break into slivers.

**Consequences:** while the main chat waits for a foreground agent, its turn runs on, so its bar spans the agent's. That is true: the turn is not over.
