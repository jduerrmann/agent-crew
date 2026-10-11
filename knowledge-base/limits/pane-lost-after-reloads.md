---
type: limit
area: plugin-loading
status: active
verified: 2026-10-11
claude-code:
updated: 2026-10-11
---

# After many hot reloads the desktop can lose an open pane

**Why:** after a day of hot reloads of the working copy, the Crew pane showed "Nothing to show yet: agent-crew has not drawn in this pane". The mod was loaded (its band drew, `reloaded (12 hooks …)`), but the pane's drawing never ran: no error, nothing at all. `/crew` said "opened" twice in a row, so the host no longer listed the pane it showed. A restart of the session fixed it. The code was not at fault.

**Workaround:**
- Restart the session. Closing and reopening the pane was not enough.
- The pane's drawing has a `try`/`catch` (`drawPane` in the `ui.render` hook): a drawing that throws shows its error in the pane. "Nothing to show yet" then means the drawing never ran, not that it failed.
- A hook must be a function literal, or the module does not load. A wrapper like `on(…, orError(async ($, e) => …))` is refused, so the catch sits inside the hook.

**Re-check when:** hot reloads keep panes attached, or the host says why a pane stayed empty.
