---
type: limit
area: plugin-loading
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# A copy loaded from a folder can't update itself

**Why:** `claude plugin update` only works on a marketplace install, which lives under `~/.claude/plugins/cache/`. A copy loaded through `CLAUDE_CODE_PLUGIN_DIRS`, such as the working copy, is a plain folder that may hold uncommitted work.

**Workaround:** the update check treats a copy as a marketplace install only if its root is under `/.claude/plugins/cache/`.
- **Marketplace install:** it runs `claude plugin marketplace update agent-crew`, then `claude plugin update agent-crew@agent-crew` with a 120 s timeout, then `reload-plugins`.
- **Folder copy:** the pane only points to `git pull` (commit 0eb39ce).

**Not verified:** the update button against a real `claude`. The tests mock the command.

**Re-check when:** the plugin CLI learns to update plugins loaded from a folder.
