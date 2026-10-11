---
type: decision
area: usage
status: active
date: 2026-10-10
decided-by: agent
updated: 2026-10-11
---

# Tokens are counted as new and cached, never as one sum

**Context:** every model request resends the whole context. A plain sum made a long agent look like it used millions of tokens.

**Decision:** "new" is input + output + cache writes. Cached reads are counted apart, and cost uses each at its own price (commit 1bd7233).

**Alternatives:** one total, which was misleading. Output tokens only, which hides real cost.

**Consequences:** the cost section and the agent cards show both figures.
