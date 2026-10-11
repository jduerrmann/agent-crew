---
type: limit
area: host-api
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# Work started inside a Button's onPress is dropped when the press ends

**Why:** the host ends the press's dispatch when `onPress` returns. Any async work started in it, such as a command, a git walk or a process, is cut off.

**Workaround:** give the work its own dispatch with `$.clock.after(1, …)`. Used for `/compact`, the *All* filter's tree walk, the update check and install, and `reload-plugins` (after 800 ms).

**Re-check when:** the host keeps a press's promises alive.
