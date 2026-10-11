---
type: decision
area: process
status: active
date: 2026-10-11
decided-by: agreed
updated: 2026-10-11
---

# Ideas live as plans in the knowledge base, active or backlog

**Context:** a review round produced a dozen ideas. The user picked some to build and asked to note the rest, so that each can be taken up in a fresh session without this conversation.

**Decision:**
- **Where:** `plans/active/` for what the user wants built, `plans/backlog/` for what is only noted. One plan per topic, from [templates/plan.md](../templates/plan.md).
- **What a plan holds:** the goal in the user's words, today's code with pointers, the approach in steps (a spike first where the platform is unproven), options and text, tests, risks, and when it is done.
- **Order:** `priority:` orders the active plans; the index lists them in that order.
- **Picking one up:** read the plan and the notes it links, then the code it points to. Move a backlog plan to `active/` (with `git mv`) only when the user asks.
- **When done:** what was learned goes into `decisions/` or `limits/`, and the plan is deleted with its index line. Git keeps it.

**Alternatives:**
- GitHub issues: the repo is public and the plans carry working notes; they also need no network to read.
- One long ideas file: plans grow, and one file per topic keeps a session's reading short.
- Keeping finished plans in a `done/` folder: decisions and limits already record the outcome, and git keeps the plan.

**Consequences:** plans go stale as the code moves. A session that picks one up checks its pointers against the code first and fixes the plan.
