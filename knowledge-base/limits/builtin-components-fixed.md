---
type: limit
area: rendering
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# The built-in components can't be bent much

**Why:** each of these was tried and failed:

| Component | What doesn't work |
| --- | --- |
| `Svg` | Takes no clicks. Swapping the SVG file rows for Buttons lost the colours and the animation. |
| `Input` | Always draws its own submit button, at a fixed width. An empty `submitLabel` only shrinks the button, and props don't remove it. |
| `Box` | A border always runs all the way round; one side can't be hidden. A seamless browser-tab look isn't possible with it. |
| Pane | Scrolls only as a whole. Two parts that scroll on their own aren't possible, and a box with a fixed height clips its content. |
| `Text` | Has no font size. |
| `Text wrap="truncate-end"` | Adds "…". On the desktop a one-row box with `overflow="hidden"` still showed a second line, because a desktop row is taller than a cell. |
| `Button` | Draws its label in one colour, so coloured counts in a label are lost. |
| `Markdown` links | Only `https:`, `http:` and `file:` work. |

**Workaround:** where the look matters, draw it yourself in a `Client` (`filerows.tsx`, `searchbox.tsx`, `tabs.tsx`):
- File rows are Client text that catches its own clicks and recolours letter by letter for the shimmer ([client-file-rows](../decisions/client-file-rows.md)).
- The search field is a Client ([own-search-field](../decisions/own-search-field.md)).
- The pane is split by framed sections, not by heights.
- Breadcrumbs are a `####` Markdown heading with `file://` links.
- Rules are SVG on the desktop ([desktop-text-is-proportional](desktop-text-is-proportional.md)).

A Client is not on every surface ([surface-features-vary](surface-features-vary.md)).

**Re-check when:** the host's component props grow.
