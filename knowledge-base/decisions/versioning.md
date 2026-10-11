---
type: decision
area: release
status: active
date: 2026-10-11
decided-by: agreed
updated: 2026-10-11
---

# Every user-visible release bumps the minor version

**Context:** marketplace installs only update when the version goes up ([marketplace-install-is-snapshot](../limits/marketplace-install-is-snapshot.md)), and the update check announces whatever `plugin.json` on GitHub says ([update-check](update-check.md)).

**Decision:**
- A release with new or changed behaviour bumps the minor version (0.5 → 0.6 → 0.7).
- The version is bumped in `plugin.json`, `marketplace.json` and the README badge together, with the subject line `agent-crew X.Y.Z: …`.
- The bump waits for the user's OK.

**Alternatives:** bumping on every push, which would announce every small change.

**Consequences:** an unreleased change can sit on `main` without being announced.
