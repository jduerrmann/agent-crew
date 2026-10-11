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
- No stop exists. Open question in the index: can a mod stop a subagent?

**Approach:**
1. **Spike, stop:** find a way that works, in this order:
   - `$.turn.abort({ turnId })` cancels only the running turn whose id `turn.start` handed this plugin. Check whether `turn.start` fires for subagent turns with an `agentId`, and whether aborting one stops the agent.
   - `$.tool.call` can run built-in tools. `TaskStop` stops background tasks; check whether background and workflow agents have a task id the mod can learn (`agent.spawn` result, `$.agent.list()`).
   - Fallback that always works: from the press on, the `tool.call` hook denies every call of that agent with a clear reason ("stopped from agent-crew"). The agent then ends on its own; mark the run `stopped`.
   Record the answer as a limit or decision note.
2. **Clickable rows:** done on the desktop. A `hotspot.tsx` click region lies over each row's picture ([redraw-drops-button-clicks](../../limits/redraw-drops-button-clicks.md)). Left: the terminal rows still open by their ▸ Button only.
3. **Details:** a small action row at the top: ■ Stop (running only, with a confirm), *Highlight its files*, *Copy answer*; then task, actions, files, answer as today.
4. ■ also in the compact view? Only if it stays readable.

**Options and text:** no option for stopping itself; texts de/en for the button, the confirm and the deny reason.

**Tests:** a press on a row opens its details; ■ marks the run stopped and later tool calls of that agent are denied with the reason; finished agents show no ■.

**Risks and open questions:** denying tool calls may make an agent retry in a loop; check what it does and whether a final message ends it. Aborting the main turn by mistake must be impossible: check ids.

**Done when:** in `/crew`, a click anywhere on an agent's row opens it, and ■ stops a running agent within a tool call.

**Afterwards:** a decision note for how stopping works, a limit note for what doesn't; answer the open question in the index; delete this plan.
