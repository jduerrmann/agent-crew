---
type: limit
area: plugin-loading
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# Plugin dirs are read at session start, and hot reload needs consent

**Why:**
- `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` is read when a session starts. A running session that predates it has no `/crew`. This happened after a chat moved folders.
- In desktop sessions a folder plugin reloads on file changes only with `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`, which is off by default.
- Claude Code then asks "Enable hot reloading for this session?". Only the person can confirm that prompt; an agent can't.
- A folder-loaded plugin's id is `agent-crew@inline`, so its options live under `pluginConfigs["agent-crew@inline"]`, not `agent-crew@agent-crew`.
- Options and module-scope state are rebuilt on every load of the module.

**Workaround:** start a new session after changing how the mod is loaded, and ask the user to allow hot reloading. When testing settings, look under the `@inline` key.

**Re-check when:** the env is read on reload.
