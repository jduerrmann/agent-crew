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

**Re-check when:** the host passes a pixel width or a measure call to panes.
