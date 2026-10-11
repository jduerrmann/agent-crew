---
type: decision
area: agents
status: active
date: 2026-10-11
decided-by: user
supersedes:
updated: 2026-10-11
---

# Real progress comes from the agents' own to-do lists, not from a tool of ours

**Context:** with savvy-progress uninstalled, its `step` tool no longer filled the bars, and the user asked for something like it. A tool of agent-crew's own would cost tokens: its entry in every request, a ToolSearch round before its first use, and an instruction for the agents to call it at all ([no-token-cost](no-token-cost.md)).

**Decision:**
- agent-crew reads the to-do lists agents keep anyway, in its `tool.call` hook. The functions are in `hooks/progress.ts`.
  - `TodoWrite` writes the calling agent's whole list.
  - `TaskCreate` and `TaskUpdate` change one task of the session's shared list (`tasks`), as the engine keeps one for all agents: any agent may update a task, and an update may give it to another (`owner`, an agent's id or name). A task counts for its owner, else for its maker; both the old and the new holder are counted anew on each change.
- The report is the completed steps of all, and the step `in_progress` (its `activeForm`, cut to 80 characters). It fills the agent's bar as savvy's `step` report did ([agent-bar-estimate](agent-bar-estimate.md)). An emptied list (`TodoWrite` with no steps, the last task deleted or handed on) removes it: the bar goes back to the estimate.
- The main chat's list shows in the timeline's main row while steps are open (`main chat 2/5`), from `mainReport` ([timeline-main-chat](timeline-main-chat.md)).
- The calls count as no action: the last action stays what it was. In the agent's log they read as where the list stands.
- savvy-progress's `step` tool is still understood.

**Alternatives:** a `step` tool of agent-crew's own, opt-in, with a plan given once and step numbers after, sent alongside real calls. Not built: it spends tokens, and agents without a prompt to call it would not. It remains the way to go if too few agents keep lists.

**Consequences:**
- An agent without a list (Explore mostly) keeps the estimate.
- A task created without an id in its result goes by its subject; an update that names an unknown task (one made before the mod loaded) changes nothing.
- An owner no agent answers to (the lead of a team under its own name) holds its tasks unseen.
- The newest 200 tasks are kept ([store-json-4mib](../limits/store-json-4mib.md)).
- The first version kept a list per calling agent and dropped updates from others; a review found it.
