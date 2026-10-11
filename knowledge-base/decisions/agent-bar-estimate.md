---
type: decision
area: agents
status: active
date: 2026-10-11
decided-by: user
supersedes: agent-bar-no-made-up-progress
updated: 2026-10-11
---

# An agent's bar is an estimate from run time and steps, unless the agent reports its steps

**Context:** the bar used to be context fill, which jumped from a few percent to full at the end. Its first replacement, a moving band ([agent-bar-no-made-up-progress](agent-bar-no-made-up-progress.md)), claimed no progress at all. The user watched it and wanted a real bar that fills slowly instead. The engine still reports no progress for a subagent ([subagents-events-only](../limits/subagents-events-only.md)), so the fill can only be an estimate.

**Decision:**
- **Estimate:** `barOf` in `hooks/register.tsx` computes `0.9 · (1 − e^−(seconds/180 + steps/20))`. That is roughly 25 % after 15 s and 4 steps, 50 % after a minute and 12 steps, and 80 % after four minutes and 40 steps. Run time keeps it moving during long tool calls, and each model request adds a little more. It never passes 90 % while the agent runs (`ESTIMATE_*`). The user chose time and steps over either one alone.
- **Smooth growth:** on the desktop the row SVG is drawn anew each second. Over that second the bar glides from its current width to the width it will have one second later (a `scaleX` animation, `runSvg`). In the terminal it grows in eighths of a cell (`▏▎▍▌▋▊▉`).
- **Reported steps** through savvy-progress's `step` tool replace the estimate with `done/total` and show `3/5 · note`. agent-crew only listens to those calls and registers no tool of its own ([no-token-cost](no-token-cost.md)).
- **Ended:** a full bar, green when done, red when failed, grey when stopped. Only the last stretch from at most 90 % remains as a jump.
- **Steps** stand in the meta line (`12 Schritte`). **Context fill** is text only (`ctx 3% · 31k`).

**Alternatives:**
- The moving band: it claimed nothing, but the user found it restless, and on the desktop it restarted with every redraw ([svg-redraw-restarts-animation](../limits/svg-redraw-restarts-animation.md)).
- Time alone: it moves the same whether the agent works or waits.
- Steps alone: it stands still between model requests and grows in jerks.

**Consequences:**
- The bar is not a measurement. A short agent ends at 20 to 30 %, and a long one creeps near 90 % for a long time.
- The prompt band's progress line ([prompt-band](prompt-band.md)) takes its bars from `barOf`.
- If savvy-progress renames its tool, reported steps go quiet and the estimate shows instead.
