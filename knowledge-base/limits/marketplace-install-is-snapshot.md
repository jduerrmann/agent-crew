---
type: limit
area: plugin-loading
status: active
verified: 2026-10-10
claude-code: 2.1.296
updated: 2026-10-11
---

# A marketplace install is a cached snapshot, even from a local folder

**Why:** installing from a marketplace copies the plugin to `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>`. That holds even when the marketplace is a local folder. The install doesn't read the folder live. It also doesn't pick up a change until the version number goes up.

We claimed the opposite once, and the user kept seeing 0.3.0 while the repo was at 0.4.0.

**Workaround:**
- **Development:** load the working copy through `CLAUDE_CODE_PLUGIN_DIRS` instead ([load-from-working-copy](../decisions/load-from-working-copy.md)).
- **Users:** bump the version for every release, or they never get the change.
- **Stuck on an old copy:**
  1. `claude plugin uninstall agent-crew@agent-crew`
  2. `claude plugin marketplace remove agent-crew`
  3. Delete the old version folders in the cache.
  4. Run `/reload-plugins`, or start a new session.

**Re-check when:** the plugin CLI offers linked (live) installs.
