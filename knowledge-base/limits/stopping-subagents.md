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

**Not checked yet:**
- Whether a mod's `$.tool.call({ tool: 'TaskStop', task_id })` gets through the permission check without a dialog. The call runs through hooks and the permission check like the model's.
- Whether a foreground subagent, which holds the main turn's Agent call, is a task that TaskStop knows.
- Workflow agents: they are missing from `$.agent.list()`, so their ids may not be task ids.

**Workaround:** for agents TaskStop doesn't know, the fallback in [agent-rows-and-stop](../plans/active/agent-rows-and-stop.md) still applies: the `tool.call` hook denies that agent's calls from the press on.

**Re-check when:** the host gains an agent stop call, or `turn.abort` accepts a subagent's turn.
