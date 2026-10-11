---
type: decision
area: ui
status: active
date: 2026-10-10
decided-by: user
updated: 2026-10-11
---

# A mod of our own: one pane for agents, files and usage

**Context:** the user wanted to see every subagent, not just those a skill spawns. savvy-progress opens its pane only for its own `savvy-*` agents. filetree shows files in a pane of its own.

**Decision:** agent-crew is a new mod. It has one pane (`/crew`) with framed sections for usage, cost, subagents, timeline and files. It is a single hooks module, with no MCP server and no background process.

**Alternatives:**
- Extending savvy-progress was rejected: it is tied to its own agents.
- Two panes for agents and files were rejected: the user wanted everything in one place.
- A second pane was offered when the pane could not be split into parts that scroll on their own. The user didn't take it.

**Consequences:** `hooks/register.tsx` carries most of the logic and is large. Parts from savvy-progress and filetree keep their MIT notices ([license](license-polyform-noncommercial.md)).
