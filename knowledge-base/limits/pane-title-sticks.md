---
type: limit
area: host-api
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# An open pane keeps its old title after a reload

**Why:** a pane keeps the title it was opened with. That holds for a pane left open by an earlier load of the module, and for one opened in another language.

**Workaround:** on start, and after a language change, an open pane is opened again with the new title (`$.ui.panes()`, then `$.ui.open`).

**Re-check when:** panes take their title from the current render.
