---
type: plan
area: files
status: backlog
priority:
effort: M
depends-on: files-tree-navigation
created: 2026-10-11
updated: 2026-10-11
---

# The tree can be cut to this round, or to one agent

**Goal:** noted for later. Less noise in long sessions.

**Today:** filters *Activity / Changes / All* ([files-tree-navigation](../../decisions/files-tree-navigation.md)); *Highlight its files* dims every file of the other agents (`focusAgent`).

**Approach:**
- A time filter beside the three: *This round* (since the person's last prompt, from `prompt.submit`), *Since the last commit* (from `commitAt` and git's HEAD).
- Agent chips: one chip per agent that touched files; a chip filters the tree to that agent's files instead of dimming the rest. *Highlight* could become the chip.
- A switch to hide files that were only read.

**Risks and open questions:** four filter dimensions get confusing; perhaps one *Show* menu (`Select`) instead of more buttons. Keep the header readable at narrow widths.

**Done when:** after a long session, one press shows only what changed since the last prompt.
