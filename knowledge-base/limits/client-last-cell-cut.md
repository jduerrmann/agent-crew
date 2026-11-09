---
type: limit
area: rendering
status: active
verified: 2026-11-09
claude-code:
updated: 2026-11-09
---

# The desktop can cut a full-width Client's last cell off

**Why:** a Client lays out on a grid of code-font cells, while the desktop gives it a width in pixels ([no-pixel-width](no-pixel-width.md)). Drawn 100 % wide, its last column can fall outside what is shown. The file search's rounded border lost its right edge there (user's screenshot, 2026-11-09). The file rows hid the same cut: their last character is a space.

**Workaround:** the search field (`searchbox.tsx`) takes `endGap`, cells left free at its right end; `hooks/register.tsx` passes 1 on the desktop and 0 in the terminal. The user saw the border whole again with it. Anything a Client draws in its last column on the desktop needs the same gap, or a trailing space as the file rows have.

**Re-check when:** the desktop sizes a Client to whole cells, or tells it its width in pixels.
