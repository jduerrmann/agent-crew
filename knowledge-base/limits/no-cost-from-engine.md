---
type: limit
area: host-api
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# The engine reports tokens, not money, and not every context window

**Why:** `turn.step` gives token counts per model request but no price, and the context window of a subagent's model isn't reported.

**Workaround:** cost is estimated from the `PRICES` regex table in `hooks/register.tsx`, falling back to `[4, 20, 0.2, 5]` per million tokens. The window is guessed: 200k for Haiku, 1M for the rest. The pane says the figure is an estimate (`≈`) ([cost-is-an-estimate](../decisions/cost-is-an-estimate.md)).

**Re-check when:** the host reports cost or the window per request. New models need a `PRICES` row until then.
