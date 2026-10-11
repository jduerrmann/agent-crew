---
type: limit
area: host-api
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# Subagents are only known through events and $.agent.list()

**Why:** there is no single registry with full details.
- `agent.spawn` reports starts while the mod is loaded, and may come without an agent id.
- Agents that started before the mod loaded, and forked skills, show up only in `$.agent.list()`. The list carries no model and no start time, and it can lag `turn.complete`.

**Workaround:**
- Without an id, the run id falls back to `tool_use_id:workflowIndex`.
- The list is polled every 3 s while something is active, and on a `turn.step` from an unknown agent id.
- Listed agents show `—` as model and the first time they were seen as start.
- The list may end or idle a running run, but never revives a finished one; only a new `turn.step` does that (`hooks/register.tsx`, list reconciliation).

**Re-check when:** `agent.list` gains model and start time, or `agent.spawn` always carries an id.
