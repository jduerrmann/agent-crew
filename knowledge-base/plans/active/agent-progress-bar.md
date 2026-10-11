---
type: plan
area: agents
status: active
priority: 2
effort: S
depends-on:
created: 2026-10-11
updated: 2026-10-11
---

# Each agent's bar shows what it says, not context fill that jumps to full

**Goal:** the user saw the bar in an agent's row make one big jump, mostly at the end, and suspected it doesn't work. Fix it so it reads honestly.

**Why:** the bar looks like progress but isn't. Someone watching many agents reads it as "almost done" or "just started".

**Today:**
- The bar is **context fill**, not progress: `ctxOf` in `hooks/register.tsx` (`contextTokens / contextMax`), drawn by `runSvg` (desktop, the `fill` value) and by the terminal `row` (`bar(run.status === 'done' ? 100 : ctx)`).
- `contextMax` comes from `windowOf(model)`: 1,000,000 for everything but Haiku. So a working agent sits at a few percent and the bar fills completely when it finishes. That is the jump.
- A subagent's progress is not reported by the engine ([subagents-events-only](../../limits/subagents-events-only.md)). What is known per agent: steps (model requests), tokens, cost, elapsed time, last action.

**Approach:**
1. Separate the two meanings. The row keeps context fill, labelled as such (`ctx 3%`), drawn as a thin meter that is *not* filled on completion.
2. For "how far along", there is no truthful percentage. Options to put to the user before building:
   - **Activity instead of progress:** while running, an indeterminate bar (a moving band, like the shimmer); done is a full bar in the status colour; failed red; stopped grey.
   - **Steps:** a step counter (`12 steps`) with a short tick per step, no implied end.
   - **Reported progress:** an optional tool an agent can call with `done/total` (as savvy-progress's `progress` tool); the bar is real only for agents that use it. Check whether savvy-progress, which the user runs, already offers this and can be read.
3. Recommended default: activity bar plus step count, and reported progress where it exists.
4. The same choice feeds the prompt band's progress line ([prompt-band](prompt-band.md)).

**Options and text:** none, unless the user wants to pick the bar's meaning.

**Tests:** a running agent's bar is not filled from its context; a finished one is full; context fill shows as text.

**Risks and open questions:** the user's wording ("großer Sprung im Tab") should be confirmed against a screenshot: is it the row bar, the compact crabs, or the timeline?

**Done when:** watching a long agent, the bar never suggests a percentage the mod doesn't know, and finishing is visible without a jump from 3 % to 100 %.

**Afterwards:** a decision note on what the bar means; delete this plan.
