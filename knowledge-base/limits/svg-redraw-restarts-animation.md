---
type: limit
area: rendering
status: active
verified: 2026-10-11
claude-code:
updated: 2026-10-11
---

# The desktop reloads every Svg on each redraw, and its CSS animations start over

**Why:** an `Svg` is an image on the desktop. When the pane draws anew, each picture's animations begin again from their first frame, even when its `source` hasn't changed. The pane redraws every second while an agent runs (its clock) and on every step of every agent. Seen in the app:
- A status dot in a picture of its own, with an unchanged source, still broke off its 1.6 s pulse every second.
- A negative `animation-delay` taken from the clock let the pulse go on where it stood. It still didn't look clean to the user and was dropped.

**Workaround:**
- **What animates goes into a Client.** A Client keeps its state and its timer across the plugin's redraws, as long as it stays under the same key. The running dots pulse in `hooks/hotspot.tsx` (which also takes presses, see [redraw-drops-button-clicks](redraw-drops-button-clicks.md)): in each agent row beside its picture (`mark` in the desktop render), and on the Active tab. The file rows' shimmer (`hooks/filerows.tsx`) works the same way, and runs smoothly.
- **Pictures hold no repeating animation.** `PANE_CSS` has no `.live` pulse any more. The timeline's and the compact view's running marks are still.
- **One-off growth** may stay in a picture: the agent bar glides over one second from its current width to the width it will have then (`runSvg`, the `gr…` keyframes). Each reload starts it from the right place, and the clock comes from `$.clock.now()` at render, not the `now` atom, which steps only once a second.
- **Animate pictures as a flip book:** the crabs can't move into a Client, so their walk is drawn as stills. `crab(…, t)` sets `--t` and `.flip`: every animation in `CRAB_CSS` is paused at the pose it would have at that moment. While an agent runs, the pane redraws every `FLIP_MS` (250 ms; `flipTimer`, started and stopped by the one-second tick). Nothing runs in the picture, so a reload has nothing to cut off. The light costume's legs and flag now take 0.5 s, since 0.25 s would look still when sampled four times a second.
- **No help:** splitting a row into several pictures so the animated ones keep their source. The desktop reloads unchanged pictures too. A picture with an empty `alt` is not drawn at all.
- **No help:** `isInteractive` on an unchanged crab picture. The frame is reloaded on each redraw as well, and it visibly blinks.
- **What it tells:** the desktop rebuilds the drawing on every redraw. Only a Client's state outlives it, and a Client draws text and boxes only, no pictures.

**Re-check when:** the host keeps an `Svg` element alive across redraws, or offers an animation that survives them.
