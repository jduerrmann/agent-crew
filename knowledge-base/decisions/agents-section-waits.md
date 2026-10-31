---
type: decision
area: agents
status: active
date: 2026-10-31
decided-by: user
supersedes:
updated: 2026-10-31
---

# The agents section waits for the first subagent

**Context:** before any subagent ran, the pane showed the agents frame with "Active 0", "Finished 0", the Compact button and "No subagent running." The user found the whole section pointless then.

**Decision:** the section is drawn only once the session has a subagent (`isAgentsShown` in `hooks/register.tsx`), on every surface. This works like the timeline, which also waits for something to show.

**Alternatives:** a one-line hint in place of the frame. It still says nothing the empty pane doesn't.

**Consequences:** *Clear finished* with nothing running hides the section again. `showAgents` still turns it off for good. "All sections hidden" still goes by the options alone.
