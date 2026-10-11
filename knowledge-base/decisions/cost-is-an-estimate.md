---
type: decision
area: usage
status: active
date: 2026-10-10
decided-by: user
updated: 2026-10-11
---

# Cost is a labelled estimate, and the cost section is off by default

**Context:** the engine reports tokens, not money ([no-cost-from-engine](../limits/no-cost-from-engine.md)). The user doesn't use session totals: "mir persönlich bringt es ja eigentlich nichts".

**Decision:**
- Cost is estimated from the `PRICES` table, which was taken from savvy, and marked with `≈`.
- The cost section (`showTotals`) is off by default. When on, it shows the main chat and the subagents apart, plus the total.
- Each agent's own figures show either way.
- An explanatory note about cost was removed at the user's request. Counting starts when the mod loads, for the main chat as well.

**Alternatives:** totals shown at the top by default. The user didn't want that.

**Consequences:** a new model needs a `PRICES` row, or it is priced by the fallback.
