---
type: decision
area: ui
status: active
date: 2026-11-03
decided-by: user
supersedes:
updated: 2026-11-03
---

# The desktop's agent tabs are the app's own buttons, the chosen one primary

**Context:** the Active and Finished tabs were bordered Boxes with a click region inside. On the desktop a Box's border takes a whole row above and below, so each tab stood three rows high, while the README pictures draw that border as a thin line. One-row chips (a Client with a tinted background) came next, and the user found them too tight and ugly. The user asked for them to look like the Compact button, only in colour.

**Decision:**
- Each tab is a Button, as Compact is: the chosen one `primary`, the other `secondary`. Its children are Texts with the sign and count in the tab's colour, but the desktop draws a Button's Texts in its own colour (the user saw no colour), so the colour comes from `primary`, the app's accent. The terminal keeps its own tabs.
- A hotspot Client in an absolute Box over each Button takes the press, so a click lands while the pane redraws for the crabs ([redraw-drops-button-clicks](../limits/redraw-drops-button-clicks.md)). Where the region falls short of the button ([client-region-over-picture](../limits/client-region-over-picture.md)), the Button's own `onPress` does the same.
- The terminal keeps its browser-style tabs (`tabs.tsx`).

**Alternatives:**
- A thinner border: a Box can't have one ([builtin-components-fixed](../limits/builtin-components-fixed.md)).
- One-row Client chips: too tight, and the user didn't like them.
- Outlined pills drawn as an Svg with click regions over them: a region counts cells and the picture pixels, so two tabs side by side would take each other's clicks.

**Consequences:**
- The Active tab's dot no longer pulses while an agent runs. A Button's Text can't pulse, and the rows' dots still do.
- The chosen tab takes the app's accent, not the tab's own colour.
- `tests/render.ts` draws a Button from its Text children, colours and dimming kept for a secondary one; the README pictures may show colour the desktop drops.
