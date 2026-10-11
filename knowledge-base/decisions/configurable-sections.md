---
type: decision
area: ui
status: active
date: 2026-10-10
decided-by: user
updated: 2026-10-11
---

# Framed sections, each can be switched off; new features come with an option

**Context:** the pane grew from agents to usage, cost, timeline and files. Fixed heights clipped content, since the pane scrolls only as a whole ([builtin-components-fixed](../limits/builtin-components-fixed.md)). The user asks for features to be "am besten konfigurierbar".

**Decision:**
- Each part is a framed section with its own switch (`showUsage`, `showTotals`, `showAgents`, `showTimeline`, `showFiles`).
- Each usage meter can be hidden on its own.
- New behaviour that not everyone wants gets an option, with a sensible default.

**Alternatives:** fixed heights with a divider. Content was clipped, so this was replaced.

**Consequences:** every option goes into `plugin.json`, the settings pane, both READMEs and both languages. Options are read as `opts.x !== false` for default-on and `=== true` for default-off.
