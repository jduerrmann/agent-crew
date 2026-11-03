---
type: limit
area: input
status: active
verified: 2026-11-03
claude-code:
updated: 2026-11-03
---

# A click region laid over a picture doesn't match the picture's size

**Why:** a `Client` lays out in cells of the code font, a desktop `Svg` in pixels, and the mod knows neither the pixels per cell nor the line height ([no-pixel-width](no-pixel-width.md)). A region in an absolute Box over a picture (`width`/`height` 100 %) didn't grow when the band's usage picture wrapped into a second row, so the second row took no clicks. Its hover also didn't line up with the text beneath it (user's screenshot).

**Workaround:**
- Keep each picture under a region one row high: the band draws one usage picture per row of meters, each with its own region ([narrow-pictures-wrap](../decisions/narrow-pictures-wrap.md)).
- Each band region reaches one row below its picture (`bottom={-1}`), as the user asked for a larger click area. Overlapping the next picture's region is harmless, since all of them open the pane. The last one stops at its picture's edge when another plugin's band follows, so it takes none of that band's presses. In the app the user saw no difference: the host may clip the region to its parent Box. Unconfirmed.
- Where the click area has to be exact, draw the text in a Client itself (file rows, tabs, search field).
- The hover's mismatch with the text remains wherever a region lies over a picture (the band's crew line, the agent rows).

**Re-check when:** the host lays a Client out in pixels, or lets a picture take presses.
