---
type: limit
area: host-api
status: active
verified: 2026-11-03
claude-code:
updated: 2026-11-03
---

# A subagent stops through TaskStop by its agent id; turn.abort can't reach it

**Why:**
- `$.turn.abort({ turnId })` cancels only the main loop's running turn, as the host types say. A subagent's turn id is refused.
- The built-in tool `TaskStop` takes a background task's id, and also a teammate's or a background agent's agent id or name. Tried on 2026-11-03 from the main chat: a background subagent stopped at once by its agent id (`task_type: "local_agent"`), and its task ended as `killed`. That is the status `$.agent.list()` reports, which the mod shows as stopped.

- From the mod, ■ in the pane stopped a background subagent the same way on 2026-11-03, twice. Its task ended as `killed`, and the pane showed it as stopped. The mod's `$.tool.call({ tool: 'TaskStop', task_id })` asked for no permission in the user's session, the notice came once, and Cancel took the question back.

**Not checked yet:**
- Whether another permission mode or a deny rule for TaskStop makes the call ask or fail. Then the hold below takes over.
- Whether a foreground subagent, which holds the main turn's Agent call, is a task that TaskStop knows.
- Workflow agents: they are missing from `$.agent.list()`, so their ids may not be task ids.

**Workaround:** ■ in an agent's details calls TaskStop with the agent id (`stopAgent` in `hooks/register.tsx`). Where it fails, the agent is held: the `tool.call` hook denies its calls from the press on, and its next `turn.complete` counts as stopped ([agent-row-click-and-stop](../decisions/agent-row-click-and-stop.md)).

**Re-check when:** the host gains an agent stop call, or `turn.abort` accepts a subagent's turn.
