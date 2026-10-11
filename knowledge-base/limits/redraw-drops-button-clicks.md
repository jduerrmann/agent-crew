---
type: limit
area: input
status: active
verified: 2026-10-11
claude-code:
updated: 2026-10-11
---

# A Button pressed across a redraw of the pane loses its click on the desktop

**Why:** the desktop rebuilds the pane on each redraw ([svg-redraw-restarts-animation](svg-redraw-restarts-animation.md)). A click is a press and a release; when the pane redraws in between, the click is lost. At one redraw a second this was rare. With the crabs' flip book, four redraws a second while an agent runs, the user found the ▸ of an agent row ignoring clicks now and then.

**Workaround:**
- **Clickable things the user reaches for while agents run are Clients that post on the press itself**, as the file rows have done all along ([client-file-rows](../decisions/client-file-rows.md)): `hooks/hotspot.tsx`.
  - A desktop agent row has a click region laid over its picture (`rowhit-<id>`, an absolute Box). A press anywhere opens or shuts its details, and the region draws the ▸ itself.
  - The Active and Finished tabs on the desktop are click regions inside their bordered Boxes (`tabhit-<id>`).
  - The presses arrive as `ui.message` from those elements.
- **The flip book runs only where it is needed:** while an agent runs on a desktop pane drawn in the last five seconds (`desktopDrawnAt`). The terminal keeps its one redraw a second.
- **Still Buttons:** *Clear finished*, compact, the settings, the files filters and the file card's buttons. They are pressed rarely while agents run. Convert them too if clicks there get lost.

**Re-check when:** the host keeps elements alive across redraws, or delivers a press that began before a redraw.
