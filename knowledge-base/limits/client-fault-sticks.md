---
type: limit
area: rendering
status: active
verified: 2026-10-31
claude-code: 2.1.296
updated: 2026-10-31
---

# A Client the host gave up on keeps showing its error until a reload

**Why:** a Client's render has a second to answer. When the desktop app is busy (four agents running, the flip book redrawing the pane four times a second), an instance sometimes misses that. The host then unmounts it and draws its error in the Client's place: "an instance of hooks/hotspot.tsx did not answer a render…". The user saw it across every agent row and the tab strip. The host raises `ui.fault` and draws the site again. A `Client` under the same key stays failed until a reload, so the error never cleared by itself.

**Workaround:** `hooks/remount.ts`. Every Client's key goes through `ck` in `hooks/register.tsx`. The `ui.fault` hook gives the failed key a new generation (`rowhit-a1~1`), so the host's redraw mounts a fresh instance there. `ui.message` reads presses under `baseKey`. Each key gets at most `MAX_REMOUNTS` (5) new instances, so a module that always fails cannot loop, and at most 200 keys are remembered. The test engine cannot raise `ui.fault`, so `remount.ts` is tested on its own.

**Re-check when:** the host remounts a failed Client by itself, or its render budget changes.
