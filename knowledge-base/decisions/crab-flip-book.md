---
type: decision
area: agents
status: active
date: 2026-10-11
decided-by: user
supersedes:
updated: 2026-10-11
---

# On the desktop the crabs walk as a flip book, four redraws a second, switchable

**Context:** the desktop rebuilds every picture on each redraw of the pane ([svg-redraw-restarts-animation](../limits/svg-redraw-restarts-animation.md)), so the crabs' CSS walk started over every second and on every agent step. A still crab was no option for the user. savvy-progress has the same problem.

**Decision:**
- **`crabMotion` = `smooth`** (default): a crab is drawn as a still of its walk at the clock's time (`crab(…, t)`, `--t`, `.flip`). While an agent runs on a desktop pane, the pane redraws every 250 ms (`flipTimer`), so the stills run as a flip book.
- **`crabMotion` = `light`:** one redraw a second, and the crabs keep their own CSS animation, which each redraw starts over, as in savvy.
- Measured in the test engine with four agents and 200 files, a redraw takes about 4 to 5 ms. The flip book adds about 13 ms a second. The desktop's own work on rebuilding the pictures is not measured.
- **Clicks:** the flip book made Buttons lose clicks, so agent rows and tabs became `hotspot.tsx` Clients ([redraw-drops-button-clicks](../limits/redraw-drops-button-clicks.md)).

**Alternatives:**
- A clock-based `animation-delay` on running animations: it never looked clean.
- An `isInteractive` picture for the crab: it blinks and is reloaded all the same.
- Separate pictures for crab and mark: they are reloaded all the same.
- The crab in a Client: Clients draw no pictures.
- Bar and clock in Clients, to drop the per-second redraw: agent steps still redraw, often and at irregular times, and the crab would jump with each one.

**Consequences:** soft motions such as the explorer's fence or the astronaut's float run at four frames a second. The racer's legs and flag take 0.5 s, since 0.25 s would look still when sampled four times a second.
