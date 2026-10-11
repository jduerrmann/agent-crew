---
type: plan
area: agents
status: backlog
priority:
effort: L
depends-on: agent-rows-and-stop
created: 2026-10-11
updated: 2026-10-11
---

# An agent's details collect its changes for review, to stage or discard

**Goal:** noted for later. Review exactly what one agent changed before committing, without leaving the pane.

**Why:** with several agents in one tree, `git diff` mixes their work.

**Today:** each run's details list the files it read and changed (`details(r)` in `hooks/register.tsx`); a file's card shows its diff against `HEAD` (`loadDiff`).

**Approach:**
1. In an agent's details, a *Changes* part: the diff of every file it changed, one `Code` block per file, from `git diff HEAD -- <files>`.
2. *Stage* (`git add -- <files>`) and *Discard* (`git restore -- <files>`, after a confirm through `$.ui.ask`).
3. Files changed by more than one agent are marked; discarding them would undo the others' work too.

**Risks and open questions:** a file's diff can't be split by agent; only whole files. Discard is destructive: always confirm, never for files with other writers without a second confirm.

**Done when:** from an agent's details its changes can be read, staged or discarded.
