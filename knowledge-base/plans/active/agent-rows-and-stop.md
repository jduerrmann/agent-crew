---
type: plan
area: agents
status: active
priority: 4
effort: M
depends-on: client-file-rows
created: 2026-10-11
updated: 2026-10-11
---

# Agent rows open on a click, and an agent can be stopped from the pane

**Goal:**
- A ■ button that stops a subagent, in its row and its details.
- The user asked to make the agents' rows and details nicer while at it: the whole row clickable, as the file rows are, instead of the small ▸.

**Why:** watching many agents, the first thing one wants to do with a wrong one is stop it. And a tiny ▸ is hard to hit.

**Today:**
- Desktop rows are pictures (`runSvg` in `hooks/register.tsx`; the desktop reloads them on every redraw, see [svg-redraw-restarts-animation](../../limits/svg-redraw-restarts-animation.md)) with a separate ▸ Button (`detailsButton`); pictures take no press ([builtin-components-fixed](../../limits/builtin-components-fixed.md)). Terminal rows are text with the same ▸.
- Details (`details(r)`) show task, recent actions, files, answer, *Highlight its files* and *Copy answer*.
- ■ Stop is in the details of a running agent (`stopRow`, `pressStop`, `stopAgent` in `hooks/register.tsx`): a first press asks, a second calls TaskStop, Cancel takes the question back. Where TaskStop fails, the agent is held (`stopping` in the store): the `tool.call` hook denies its calls until its `turn.complete`, which then counts as stopped. A hotspot Client where the surface has one, else Buttons. Tests cover both ways; not yet tried in the app.

**Approach:**
1. **Spike, stop:** first part done ([stopping-subagents](../../limits/stopping-subagents.md)).
   - `turn.abort` reaches only the main loop: out.
   - `TaskStop` with the agent id stopped a background subagent at once. Use it first: `$.tool.call({ tool: 'TaskStop', task_id: run.agentId })` in a dispatch of its own (`$.clock.after`, [onpress-work-dropped](../../limits/onpress-work-dropped.md)).
   - Still to check, live in the mod: does the call pass the permission check without a dialog; does it stop a foreground subagent; workflow agents.
   - Fallback where TaskStop answers with an error: from the press on, the `tool.call` hook denies every call of that agent with a clear reason ("stopped from agent-crew"). The agent then ends on its own; mark the run `stopped`.
2. **Clickable rows:** done on the desktop. A `hotspot.tsx` click region lies over each row's picture ([redraw-drops-button-clicks](../../limits/redraw-drops-button-clicks.md)). Left: the terminal rows still open by their ▸ Button only.
3. **Details:** ■ Stop sits at the top (done). Left: move *Highlight its files* and *Copy answer* into that row; then task, actions, files, answer as today.
   - In the app, check: does TaskStop from the mod open a permission dialog; does it end a foreground subagent; does a held agent loop on denied calls or end. Record the answers in [stopping-subagents](../../limits/stopping-subagents.md).
4. ■ also in the compact view? Only if it stays readable.

**Options and text:** no option for stopping itself; texts de/en for the button, the confirm and the deny reason.

**Tests:** a press on a row opens its details; ■ marks the run stopped and later tool calls of that agent are denied with the reason; finished agents show no ■.

**Risks and open questions:** denying tool calls may make an agent retry in a loop; check what it does and whether a final message ends it. Aborting the main turn by mistake must be impossible: check ids.

**Done when:** in `/crew`, a click anywhere on an agent's row opens it, and ■ stops a running agent within a tool call.

**Afterwards:** a decision note for how stopping works, a limit note for what doesn't; answer the open question in the index; delete this plan.
