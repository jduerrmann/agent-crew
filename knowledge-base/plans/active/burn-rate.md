---
type: plan
area: usage
status: active
priority: 5
effort: M
depends-on: no-token-cost
created: 2026-10-11
updated: 2026-10-11
---

# The usage meters forecast when a limit runs out at the current pace

**Goal:** the user liked this one: see early whether the round will run into the 5-hour or weekly limit, e.g. "5h limit at this pace in ~40 min". Optionally a cost limit per agent that raises a notice.

**Why:** today the meters show where a limit stands, not where it is heading. With many agents a limit can go from 60 % to 100 % within one round.

**Today:**
- `session.measure` brings the context and the plan's limits (`percentUsed`, `resetsAt`) after each main-thread turn; `storeUsage` keeps the latest in the `usage` atom ([usage-arrives-late](../../limits/usage-arrives-late.md)).
- `warnLimits` warns at 80 % and 95 %. Each run carries `costUsd` and token counts from `turn.step`.
- Nothing keeps a history of the percentages, so there is no rate.

**Approach:**
1. Keep a short history per limit: `(at, percent)` samples from `storeUsage`, capped (e.g. the last 2 hours or 60 samples) in a new atom; reset it when `resetsAt` moves on (a new window).
2. Rate over a sliding window (e.g. the last 15–30 minutes, at least two samples and some minutes apart): percent per minute. Forecast = (100 − percent) / rate.
3. Show it only when it matters: when the forecast is earlier than the limit's reset, as a sub line of the meter ("at this pace: full in ~40 min, resets in 2h"), amber when under an hour.
4. Optional notice when the forecast drops below a threshold (e.g. 30 minutes), once per window; goes through `notify`, respects `limitWarnings`.
5. Per-agent cost limit: option `agentCostLimit` (USD, 0 = off). When a run's estimated cost crosses it, one notice naming the agent. Stopping it then is a later step that needs [agent-rows-and-stop](agent-rows-and-stop.md).
6. Nothing here calls a model ([no-token-cost](../../decisions/no-token-cost.md)).

**Options and text:** `limitForecast` (default on), `agentCostLimit` (number, 0); texts de/en; both READMEs; the prompt band can show the forecast later.

**Tests:** fed samples 50 % → 70 % over 20 minutes forecast ~30 minutes; no forecast with one sample or a falling rate; a new window clears the history; a run over `agentCostLimit` raises exactly one notice.

**Risks and open questions:** samples arrive only after main-thread turns, so the rate is coarse while only subagents work; say "about". Check that `plugin.json` `userConfig` takes a number type.

**Done when:** during a busy round the 5-hour meter says when it will be full, and stays quiet when the pace is harmless.

**Afterwards:** a decision note on the forecast; delete this plan.
