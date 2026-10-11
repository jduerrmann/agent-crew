---
type: decision
area: process
status: active
date: 2026-10-10
decided-by: user
updated: 2026-10-11
---

# Public repo and marketplace named agent-crew

**Context:** the repo started as `claude-mods` and was published on GitHub.

**Decision:**
- The repo and the marketplace are both `agent-crew`, so it installs as `agent-crew@agent-crew`.
- The local working folder keeps its old name `claude-mods`, because sessions and the plugin dir point there.
- Commits use `jduerrmann` with the GitHub noreply address, set for this repo only.

**Alternatives:** keeping `claude-mods`, a name too generic for one mod.

**Consequences:** the folder name and the repo name differ; links and install commands use `agent-crew`.
