---
type: decision
area: files
status: active
date: 2026-10-10
decided-by: agent
updated: 2026-10-11
---

# A conflict is two agents writing one file within ten minutes

**Context:** the user picked a warning on conflicting edits from a list of ideas.

**Decision:** two different writers on one file within 10 minutes count as a conflict. It is flagged once per new writer and cleared by a commit. Recent writes are kept apart from the file's history, so reads in between can't hide one. `warnConflicts` switches the notice off.

**Alternatives:** none written down. The 10 minutes are a judgement call for "close together", not a measured value.

**Consequences:** two agents taking turns slowly on one file aren't flagged. Change the window here if it proves too short or too long.
