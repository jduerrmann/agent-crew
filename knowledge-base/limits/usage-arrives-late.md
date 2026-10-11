---
type: limit
area: host-api
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# Usage figures arrive late

**Why:** `session.measure` (context fill, 5-hour and weekly limits) fires only after a main-thread turn, and `$.session.usage()` at session start can fail.

**Workaround:** the usage section shows nothing until the first figures come. The countdowns to the resets keep running from the last figures while the pane is open.

**Re-check when:** the host pushes usage on its own schedule.
