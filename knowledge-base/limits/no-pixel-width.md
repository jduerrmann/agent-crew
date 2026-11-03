---
type: limit
area: rendering
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# A pane knows its width in columns only, never in pixels

**Why:** the host passes `e.props.bodyColumns` and nothing else about size. SVG text can't be measured either.

**Workaround:** about 8 CSS px per column, clamped to 220–900 px, for the SVG width. Text widths are estimated per character (`charEm`, `fitText` in `hooks/crab.ts`), and labels are shortened to fit.

The estimate can run wider than the pane. Whatever stands beside a picture with a `width` is then pushed past the edge: the agent rows' ✓ and ▸ did that in a narrow pane. So a desktop agent row is its picture alone, handed over without `width` and `height`. The desktop then takes the markup's size "up to the slot" and scales it down where the room is smaller. The row's mark is drawn inside it, and only the running dot (a Client) and the ▸ lie over it.

**Re-check when:** the host passes a pixel width or a measure call to panes.
