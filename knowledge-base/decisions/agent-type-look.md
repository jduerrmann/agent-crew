---
type: decision
area: agents
status: active
date: 2026-10-11
decided-by: user
supersedes:
updated: 2026-10-11
---

# Every agent type has its own colour; costumes go by type, not by savvy tier

**Context:** colours came from a hash of the type into eight colours, so two types could share one, and savvy-flow's tiers had colours and costumes of their own. The user wanted a colour per type, no savvy crabs, and asked whether Claude could be made to pick a fitting type when it spawns one.

**Decision:**
- **Colours:** Claude Code's own types have fixed ones (`TYPE_COLOR`: general-purpose blue, Explore green, Plan amber, claude-code-guide violet, statusline-setup teal). Any other type takes the next colour of `TYPE_PALETTE` no type holds yet, when it is first seen; the store keeps it (`typeColors`, by lower-case bare type), so it stays across reloads. Past eight such types the colours go round again. Forks stay grey.
- **Costumes**, named by their look: pirate for Explore, engineer (hard hat) for Plan, astronaut for claude-code-guide, chef for workflow agents, racer for teammates, detective for general-purpose, a cap in the type's colour for every other type. savvy-flow's types are ordinary custom types now.
- **No forced type** (the user's choice): the mod does not refuse an Agent call without a `subagent_type`. It cannot judge which type fits without a model, and every refusal costs a second attempt in tokens ([no-token-cost](no-token-cost.md)). general-purpose is the right default for open tasks, and it now wears the detective rather than a plain cap.

**Alternatives:**
- A larger hash palette: still lets two types share a colour.
- Rewriting `subagent_type` from words in the description: would swap tools under the agent (Explore cannot write), so not done.

**Consequences:** `#9C6644` replaced a brown that the detective's hat uses, so a colour test can tell them apart. savvy-progress's `step` reports still fill the bar ([agent-bar-estimate](agent-bar-estimate.md)); only the crabs left.
