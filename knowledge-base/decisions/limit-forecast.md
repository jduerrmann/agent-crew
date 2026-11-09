---
type: decision
area: usage
status: active
date: 2026-11-09
decided-by: agreed (forecastAlways: user)
supersedes:
updated: 2026-11-09
---

# A limit's meter says when it fills at the current pace, and only when that comes before its reset

**Context:** the meters showed where a limit stood, not where it was heading. With many agents a 5-hour limit can go from 60 % to 100 % within a round. The user liked a forecast ("5h limit at this pace in ~40 min") and an optional cost limit per agent.

**Decision:**
- **History:** each limit's readings go into `usageHistory` by kind (`hooks/forecast.ts`, `addSample`): at most 60, none older than two hours. Kept readings lie a minute apart; the newest floats until it is a minute past the one before. A new reset time (more than a minute off) or a falling percentage starts the history over.
- **Pace:** from an earlier reading to the newest (`fullIn`). The earlier one lies at least three minutes back and at least three points (`MIN_RISE`) below: the oldest such reading of the last half hour, else the newest one before it, so a slow limit is read over up to two hours. One point comes off the rise for rounding, which can only make the forecast later. No forecast without such a reading, or when the newest is more than half an hour old.
- **Shown:** only when the limit fills before it resets (`fillsBeforeReset`), first on the meter's second line (`full in ~40m · resets in 2h`), amber and bold under an hour. Desktop picture and terminal row alike; not in the band above the prompt.
- **Always, on request:** the user asked for a way to see the forecast even when the limit would fill only after its reset. The option `forecastAlways` (off by default) shows it then too, dimmed, never amber and with no notice (`isBeforeReset` on the meter).
- **Notice:** once per window under 30 minutes, through `notify`, behind `limitWarnings` as well as `limitForecast`, kept in `warned` as `pace:<kind>`.
- **Cost per agent:** `agentCostLimit` is a choice (`off`, 1, 2, 5, 10, 20 dollars), not a number field, as the settings tab has switches and choices only. One notice per run when its estimated cost passes it (`isOverCost`). It doesn't stop the agent.

**Alternatives:**
- Any rise over three minutes, as first built: the weekly limit stepped from 25 to 26 % within minutes and was forecast full in about four hours, while the 5-hour limit rose 3 points in half an hour (user's screenshot). The percentages can come as whole numbers, so a step of a point is often rounding.
- A linear fit over every reading: the readings come only after main-thread turns, often in bursts, so a fit leans on whichever stretch has the most. Two readings far enough apart are as good and easier to reason about.
- Forecasting the context window: it shrinks on `/compact` and grows with the conversation, not with time.
- Stopping an agent over its cost limit: a notice is enough to start with; stopping goes through ■ ([agent-row-click-and-stop](agent-row-click-and-stop.md)).

**Consequences:**
- While only subagents work, readings arrive seldom and the forecast is rough or missing ([usage-arrives-late](../limits/usage-arrives-late.md)); the README says so, and the text says "~".
- Readings without a reset time count as the same window, so a reset is caught by the falling percentage.
- Tests that count on the pace start the mock engine without limits (`paceEngine`), since the start's own reading is a sample too.
