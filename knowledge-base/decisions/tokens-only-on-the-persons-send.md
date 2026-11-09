---
type: decision
area: other
status: active
date: 2026-11-09
decided-by: user
supersedes: no-token-cost
updated: 2026-11-09
---

# agent-crew spends no tokens on its own; what the person sends from the pane is theirs

**Context:** [no-token-cost](no-token-cost.md) ruled out anything that spends tokens. Then the user wanted to message a subagent, or resume a finished one, from the pane. Such a message costs tokens, but only because the person wrote and sent it. The other way, asking the main chat to send it on, costs more: the main chat's turn on top of the agent's.

**Decision:**
- The mod never calls a model and never starts work on its own: no summaries, no classifying, no automatic follow-ups, as before.
- A press of the person's own that sends something they wrote (a message to an agent, a resume) is allowed. It is said where it is offered: the option's text names the cost.

**Alternatives:**
- Keep the old rule: messages only through the main chat, which costs more for the same result.
- An opt-in summary or other work the mod starts by itself: still rejected.

**Consequences:**
- Plans may include features the person triggers with their own text; features the mod would run by itself still don't belong in the backlog.
- Each such feature comes with an option, and its description says it costs tokens.
- The feature that prompted this, messaging an agent from the pane, could not be built: in auto mode the host refuses a mod's SendMessage ([plugin-send-needs-a-request](../limits/plugin-send-needs-a-request.md)). The rule stands for the next one.
