---
type: decision
area: ui
status: active
date: 2026-10-11
decided-by: user
supersedes:
updated: 2026-10-11
---

# A band above the prompt shows the crew and, optionally, progress and usage

**Context:** the pane is often closed or on another tab. What matters while agents run should sit where the person types.

**Decision:**
- **Where:** a `ui.render` hook on `AbovePrompt` draws the band. When a survey holds the band (`hasSurvey`), the hook passes.
- **Lines:** each has its own option in the settings group *Above the prompt*:
  - `bandAgents` (on): the crew. On the desktop each running agent walks as its crab (`bandCrewSvg`), then the counts follow: running, done, failed, conflicts. In the terminal a pulsing dot in each running agent's colour stands in for the crab (`bandLines`). The first count names the subagents (`3 Subagenten fertig`), so a band of finished agents still says what it counts. The line stays away until the first agent of the session.
  - `bandProgress` (off): each running agent's name and bar (`barOf`) beside its crab, at most what fits, then `+n`.
  - `bandUsage` (off): the pane's usage rings (`usageSvg`) on the desktop, small cell bars in the terminal. It respects the `usage*` options and shows the time until each limit resets. A `/compact` button sits beside it, as in the pane's usage section; it is a click region with a background (`bg`), not a Button.
  - `statusLine` (on): the status line entry `🦀 N Subagenten aktiv`, now switchable.
- **Click:** every line is a `hotspot.tsx` click region (over the pictures on the desktop), and a press opens the pane ([redraw-drops-button-clicks](../limits/redraw-drops-button-clicks.md)). The press brings the pane into view even when it is open as a tab behind or waits unplaced ([open-does-not-raise-pane](../limits/open-does-not-raise-pane.md)). It never shuts the pane.
- **Counts fit the band:** in words while they fit, else as signs and numbers (`● 2 · ✓ 3`), else the last ones give way to `…`. The crabs take only the room left beside them.
- **Other bands:** the platform shows one band, the first hook's answer. agent-crew calls `next(e)`. When a plugin beneath draws a band of its own (savvy-progress during a flow), that band stays under agent-crew's in one column. When it is the engine's own (`{ type: 'engine' }`), agent-crew's band stands alone.
- **Redraws:** the band reads `now` only while something in it moves: the crabs' walk on the desktop, a bar, a reset's countdown. It sets `desktopDrawnAt`, so the crabs' flip book ([crab-flip-book](crab-flip-book.md)) runs with the pane closed too.

**Alternatives:**
- A text-only band with a 🦀 for the crew and percentages for the usage: the user wanted the pane's crabs and rings.
- Returning agent-crew's band without `next(e)`: it would push away a band of another plugin beneath it.

**Consequences:** a plugin above agent-crew in the chain that draws its own band without calling `next(e)` hides agent-crew's. Only four agents fit with their bars in a narrow column, and the rest count as `+n`.
