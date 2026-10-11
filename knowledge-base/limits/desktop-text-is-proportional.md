---
type: limit
area: rendering
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# The desktop sets pane text in a proportional face: no cell art

**Why:** the desktop app draws text in a proportional font, and its lines are taller than a terminal cell. Box-drawing characters (`─ │ ╭`) don't line up, and a row of `─` doesn't make a straight rule.

**Workaround:** the desktop gets things the app draws itself. Tabs are bordered `Box`es there; the terminal draws them with the `tabs.tsx` Client. The rule above the legend is a 9 px SVG at frame width on the desktop and a dashed row in the terminal (`hooks/register.tsx`, the `boxTabs` block and the legend rule).

**Re-check when:** the desktop offers a monospace text mode for panes.
