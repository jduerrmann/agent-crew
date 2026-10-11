---
type: decision
area: files
status: active
date: 2026-10-11
decided-by: user
updated: 2026-10-11
---

# The search field is a Client of its own

**Context:** the user wanted the search across the full frame, with no `/` and no button. The built-in `Input` always draws a submit button and has a fixed width ("Der Knopf ist leider noch da, nur eben sehr klein").

**Decision:** `hooks/searchbox.tsx` draws the field on the cell grid. Enter opens the first hit, and × clears the field. The hooks module decides whether the field looks focused ([client-no-blur-event](../limits/client-no-blur-event.md)).

**Alternatives:** `Input` with an empty `submitLabel` still shows a small button.

**Consequences:** focus is a guess from other input. `Input` stays as the fallback on surfaces without a Client.
