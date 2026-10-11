---
type: limit
area: host-api
status: active
verified: 2026-10-11
claude-code:
updated: 2026-10-11
---

# Opening an open pane only retitles it; it doesn't bring it into view

**Why:** by the host's contract (`PaneOpenArgs`, `UiPane`):
- `$.ui.open({ id })` on an id that is already open delivers the new title, nothing more. A pane that is a tab behind another (`isShown: false`), or one that waits unplaced (`isPlaced: false`), stays where it is.
- `focus: true` would raise it, but it is a request. It is refused while the band or a pane holds the keys, text is in the composer, or a dialog is up. Right after a click on the band, the band holds them.
- Only an open that answers the person's input (a command, a prompt, a press) counts as asked for and is placed at any width. One made on its own waits unplaced below 144 terminal columns (110 for an id they once opened). An open moved to `$.clock.after` is no longer the answer to the input.
- `$.ui.panes()` lists every open pane, seen or not, with `isShown` and `isPlaced`.

**Workaround:** `showPane` in `hooks/register.tsx`:
- A pane that is open but not both shown and placed is closed and opened anew; a new pane is shown.
- It asks for `focus` all the same, for the case it is granted.
- It runs in the answer to the input: awaited in the `ui.message` hook for a click on the band, and in `command.run` for `/crew`.
- `/crew` shuts only a pane that is shown and placed; any other comes into view.

The tests' `engine()` keeps panes as the host does (`PaneState`), so a test checks what is shown, not only that `ui.open` was called.

**Re-check when:** the host offers a call that raises a pane, or `ui.open` raises one that is open.
