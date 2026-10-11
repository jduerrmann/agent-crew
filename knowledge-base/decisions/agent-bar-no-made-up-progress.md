---
type: decision
area: agents
status: superseded
date: 2026-10-11
decided-by: user
supersedes:
updated: 2026-10-11
---

# An agent's bar shows activity or reported steps, never context fill

> **Superseded** by [agent-bar-estimate](agent-bar-estimate.md): the user saw the moving band and preferred a bar that fills slowly.

**Context:** the bar in each agent row was the context window's fill. With a 1M window a working agent stood at a few percent and the bar filled completely when it finished. The user saw one big jump at the end and took the bar for broken. The engine reports no progress for a subagent ([subagents-events-only](../limits/subagents-events-only.md)), so there is no true percentage to show.

**Decision:**
- **Running:** a moving band, no percentage. On the desktop it is a CSS animation inside the track (`runSvg`, one pass in `SWEEP_MS`). The row SVG is drawn anew every second and on every report, which restarts its animation, so a negative `animation-delay` taken from the clock puts the band back where it was. Without it the band jumped back to the start on every redraw. In the terminal it moves two cells per one-second redraw (`SWEEP` in the text rows).
- **Reported steps:** a worker that calls savvy-progress's `step` tool (`mcp__savvy-progress__step`, `done/total/note`) fills the bar to `done/total` and shows `3/5 · note` beside it. agent-crew only listens to those calls in its `tool.call` hook (`STEP_TOOL`, `stepReport`). It doesn't register a tool of its own, which would cost every request tokens ([no-token-cost](no-token-cost.md)). The report counts as no action: the last action stays what it was.
- **Ended:** a full bar, green when done, red when failed, grey when stopped (`barOf`).
- **Steps:** the count of model requests stands in the meta line (`12 Schritte`).
- **Context fill:** text only (`ctx 3% · 31k`), with no bar of its own.

**Alternatives:**
- Activity alone, without reported steps: rejected, since savvy workers already report their steps.
- A tally of steps with no bar: rejected, since a bar reads faster.
- A thin second bar for context: the user chose text, because with 1M windows it is nearly always small.

**Consequences:** the prompt band's progress line ([prompt-band](../plans/active/prompt-band.md)) should take its bars from `barOf`. If savvy-progress renames its tool, reported steps go quiet and the band shows instead.
