---
type: decision
area: ui
status: active
date: 2026-10-10
decided-by: agent
updated: 2026-10-11
---

# The desktop gets SVG, the terminal gets the same content as text

**Context:** the pane runs in both. The desktop can show SVG, but its text is proportional ([desktop-text-is-proportional](../limits/desktop-text-is-proportional.md)). The terminal is a cell grid.

**Decision:**
- The desktop gets SVG. It uses CSS-only animation that respects `prefers-reduced-motion`, and the crab animation periods divide one second so the redraw once a second stays in phase.
- The terminal gets text with the same content.
- The timeline folds pauses longer than 90 s into breaks, which together take at most 40 % of the axis, so rounds of work an hour apart keep readable bars.

**Alternatives:** text on both surfaces. That loses the crabs, meters and timeline on the desktop.

**Consequences:** every visual change needs both renderers, and the tests run on both surfaces.
