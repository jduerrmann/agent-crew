---
type: decision
area: process
status: active
date: 2026-10-11
decided-by: user
updated: 2026-10-11
---

# The user runs the working copy, not a marketplace install

**Context:** a local marketplace install was a cached snapshot. The user kept seeing old versions ([marketplace-install-is-snapshot](../limits/marketplace-install-is-snapshot.md)) and wanted "nurnoch die aus dem arbeitsordner".

**Decision:**
- The marketplace install and the local marketplace were removed.
- `~/.claude/settings.json` loads this repo's `plugins/agent-crew` through `CLAUDE_CODE_PLUGIN_DIRS`, with `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`.
- The plugin id is `agent-crew@inline`.

**Alternatives:**
- The local marketplace (`claude-mods`) was used until 0.4.0, then dropped.
- A junction into a session's dev-mods folder was dropped as well.

**Consequences:** every edit in this repo is live in the user's sessions, half-done work included. Settings live under `pluginConfigs["agent-crew@inline"]` ([plugin-dirs-at-session-start](../limits/plugin-dirs-at-session-start.md)).
