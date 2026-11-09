---
type: decision
area: agents
status: active
date: 2026-11-09
decided-by: agreed
supersedes:
updated: 2026-11-09
---

# An agent's row opens on a click anywhere, and its details start with ■ Stop and the other actions

**Context:** the user wanted the agents' rows clickable as a whole, as the file rows are, instead of a small ▸, and a way to stop a wrong agent from the pane.

**Decision:**
- **Row:** on both surfaces a `hotspot.tsx` Client takes the press on the row, on the press itself, so it lands while the pane redraws ([redraw-drops-button-clicks](../limits/redraw-drops-button-clicks.md)). On the desktop it lies over the row's picture. In the terminal it draws the row's lines itself (`line`, `right` for the ▸, `more` for the lines below), so the click area is exactly the text ([client-region-over-picture](../limits/client-region-over-picture.md)). Without a Client the rows keep their ▸ Button.
- **Actions row:** the details open with one row of chips: *■ Stop* for a running agent, *Highlight its files* when it touched any, *Copy answer* when it has one. They are click regions too (`stophit-`, `focushit-`, `copyhit-`, handled by `pressAction`), Buttons where there is no Client. The row wraps in a narrow pane.
- **Stop:** the first press asks (*■ Really stop?* and *Cancel*), the second calls `TaskStop` with the agent id in a dispatch of its own ([onpress-work-dropped](../limits/onpress-work-dropped.md)). Where TaskStop fails, the agent is held: the `tool.call` hook denies its calls with a reason naming agent-crew, and its next `turn.complete` counts as stopped ([stopping-subagents](../limits/stopping-subagents.md)).
- **Not in compact view:** compact is one picture of crabs, and a click region can't be matched to a crab in a picture.

**Alternatives:**
- `$.turn.abort` with the agent's turn: it reaches only the main loop.
- ■ on the row itself: the row is the press that opens it, and a stop next to it is easy to hit by mistake. In the details it is one deliberate step further away and still asks once.
- A region laid over the terminal row's Texts: a Client can't be shown to let the Texts beneath it through, and drawing the lines in the Client costs nothing.

**Consequences:**
- A terminal agent row's text lives in the Client's props, not in Texts: tests look for it with `shows` in `tests/crew.test.ts`, not `ui.find({ text })`.
- Copy goes through the `ui.message` hook (`pressAction`), not a Button's `onPress`.
- Seen in the app on 2026-11-09: the row click, the actions row (Highlight, Copy answer) and ■ stopping a background subagent. Not yet: a foreground subagent.
