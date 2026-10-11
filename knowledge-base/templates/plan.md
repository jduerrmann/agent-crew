---
type: plan
area: ui | files | agents | usage | settings | release | process | other
status: active            # active | backlog
priority: 1               # order among the active plans; backlog plans leave it empty
effort: S | M | L
depends-on:               # slugs of plans or notes this builds on, if any
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# <What the plan delivers, as a claim>

**Goal:** what the user asked for, in a sentence or two, and what they said about it.

**Why:** what it changes for someone running many subagents.

**Today:** what the code does now, with the places to start reading (`hooks/register.tsx` …).

**Approach:**
1. The steps, in order. Start with a spike where the platform is unproven.
2. …

**Options and text:** new options (plugin.json `userConfig`, the settings tab, both READMEs) and pane text in German and English.

**Tests:** what proves it works; a fixed bug needs a test that fails on the old code.

**Risks and open questions:** what may not work, and what to check first.

**Done when:** the user-visible result, so the session knows when to stop.

**Afterwards:** what turns into a decision or a limit note, and that this plan is deleted.
