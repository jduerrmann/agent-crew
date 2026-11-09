---
type: decision
area: other
status: superseded
date: 2026-10-11
decided-by: user
updated: 2026-11-09
---

> Superseded by [tokens-only-on-the-persons-send](tokens-only-on-the-persons-send.md): what the person sends from the pane may cost tokens.

# Nothing in agent-crew spends model tokens

**Context:** a review proposed a one-line summary of each finished agent, written by `$.model.complete`. The user turned it down: nothing the mod does on its own may cost tokens.

**Decision:** agent-crew never calls a model. Everything it shows comes from events, tool calls, git, the file system and the host's figures.

**Alternatives:** an opt-in summary per agent. Rejected even as an option.

**Consequences:**
- Ideas that need a model (summaries, classifying changes, explaining diffs) are out of scope. Don't add them to the backlog.
- Burn-rate forecasts and similar figures are computed from the numbers the engine already reports.
