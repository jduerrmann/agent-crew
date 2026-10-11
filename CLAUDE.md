# agent-crew

Claude Code mod in `plugins/agent-crew`, published as the public repo `jduerrmann/agent-crew`.

## Knowledge base

[knowledge-base/README.md](knowledge-base/README.md) is the index of what the platform doesn't allow (`limits/`) and why things are built the way they are (`decisions/`). Read the index before changing a part of the pane, and open the notes that match. Don't undo a recorded decision without saying so.

**With every change**, ask whether it taught something the code doesn't show. If so, update the knowledge base in the same commit:
- **Something isn't possible:** add a note in `limits/`.
- **A limit no longer holds:** set its `status: lifted`.
- **A choice between alternatives, or a decision by the user:** add a note in `decisions/`.
- **A decision is replaced:** write a new note with `supersedes:`. The old one is marked, never rewritten.

Add every note to the index. Routine changes need no note.

## Plans

What to build next lives in `knowledge-base/plans/`: `active/` in `priority:` order, `backlog/` only noted. Each plan stands alone for a fresh session.
- **Taking one up:** read it, the notes it links and the code it points to; fix the plan where the code has moved. Start a backlog plan only when the user asks, and move it to `active/` with `git mv`.
- **New ideas:** the user's go-ahead makes an active plan, anything else a backlog plan, from `knowledge-base/templates/plan.md`. Nothing that spends model tokens ([no-token-cost](knowledge-base/decisions/no-token-cost.md)).
- **Done:** turn what was learned into decisions or limits, then delete the plan and its index line in the same commit.

## Rules

- Before a commit, `claude plugin validate plugins/agent-crew` and `claude plugin test plugins/agent-crew` must pass, and a change in behaviour brings a test.
- Change files with Edit and Write, not with scripts or heredocs: on this Windows machine they mangle backslashes.
- Commit and push only when the user asks.
- Commit messages are English.
- The repo is public, so nothing personal goes into it.

Checklists for testing, releases, code conventions and commits: [knowledge-base/workflow.md](knowledge-base/workflow.md).
