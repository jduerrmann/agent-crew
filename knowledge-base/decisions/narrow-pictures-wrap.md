---
type: decision
area: ui
status: active
date: 2026-11-03
decided-by: agreed
supersedes:
updated: 2026-11-03
---

# Pictures wrap their parts onto more lines in a narrow pane, they don't overlap

**Context:** at the 220 px the desktop pictures shrink to at least ([no-pixel-width](../limits/no-pixel-width.md)), the usage meters ran into each other and past the right edge, and the cost rows drew their tokens across their names. The user sent a screenshot.

**Decision:**
- The usage meters stand side by side while each meter's heading (`41% Woche`) and about 70 px of its second line fit its share of the width. Otherwise they go into fewer columns, one row under the other. `usageSvg` returns its height, and the band uses it too.
- When the tokens of any cost row don't fit between its name and its cost, every row puts them on a line of their own beneath it (height 130 instead of 92). The names are shortened to the room left of the cost.
- In the band above the prompt every row of meters is a picture of its own, each under its own click region (`band-1`, `band-2`, …). A region laid over a picture counts rows of the code font and doesn't grow with a taller picture ([client-region-over-picture](../limits/client-region-over-picture.md)), so the second row of one tall picture couldn't be clicked. The user chose to keep the rings rather than draw the meters as text Clients with ◔-style glyphs.
- At the widths the README pictures use, the drawing is unchanged.

**Alternatives:**
- A smaller font: the desktop text is already small, and one size per picture reads better.
- Dropping the tokens or the reset times: that hides figures the section is for.

**Consequences:** a picture with several parts measures them with `textWidth` before it places them, and returns its height. `tests/crew.test.ts` checks that no text runs past the edge or onto another (`expectLaidOut`).
