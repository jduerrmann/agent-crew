---
type: limit
area: host-api
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# A plugin gets one hook per event

**Why:** the host refuses a second `on(…)` for an event the plugin already handles. Two `ui.message` hooks were refused in the tests.

**Workaround:** one handler per event in `hooks/register.tsx`, which dispatches on the message or pane inside. New behaviour joins the existing handler.

**Re-check when:** the host allows several handlers per event.
