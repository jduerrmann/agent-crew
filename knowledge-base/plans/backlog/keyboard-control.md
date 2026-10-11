---
type: plan
area: ui
status: backlog
priority:
effort: M
depends-on:
created: 2026-10-11
updated: 2026-10-11
---

# The pane can be driven from the keyboard

**Goal:** noted for later; the user doesn't need it now. Move through agents and files without the mouse.

**Today:** the file rows and the search field are Clients with `surface.onKey` (the search uses it); the rest are Buttons on the pane's focus ring.

**Approach:**
- In the file rows' Client: ↑↓ (and j/k) move a cursor row, Enter opens the card, `o` opens the file, `c` copies the path, `/` jumps to the search, `1`/`2`/`3` pick the filter.
- Agent rows the same, once they are a Client ([agent-rows-and-stop](../active/agent-rows-and-stop.md)); `s` stops.
- A hint line with the keys at the bottom of the pane, shown while a Client holds the keys.

**Risks and open questions:** a Client gets keys only after a click gives it the focus, and never hears it lost them ([client-no-blur-event](../../limits/client-no-blur-event.md)). filetree has arrow keys and Enter; look at how it shows the cursor.

**Done when:** a file can be found, opened and its path copied without the mouse.
