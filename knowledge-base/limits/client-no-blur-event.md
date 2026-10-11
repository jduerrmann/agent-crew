---
type: limit
area: input
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# A Client region is never told that it lost the keys

**Why:** the host's focus events (`UiFocusInput`) cover Button, Input and Select only. A Client that took the keys with a click hears nothing when the person types in the prompt or presses elsewhere, so it would go on looking focused.

**Workaround:** the hooks module owns `isSearchFocused` and clears it on `prompt.edit`, `ui.press`, `ui.focus` and clicks on file rows or tabs. The search field (`hooks/searchbox.tsx`) draws whatever `isFocused` it is given. A click in the field or a key it receives sets it again (commit d3bad87).

**Known gap:** a click into the chat transcript without typing goes unnoticed, so the field still looks focused.

**Re-check when:** Client regions get a blur event.
