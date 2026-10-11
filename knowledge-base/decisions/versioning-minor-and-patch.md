---
type: decision
area: release
status: active
date: 2026-10-11
decided-by: user
supersedes: versioning
updated: 2026-10-11
---

# New features bump the minor version, fixes the patch version

**Context:** every user-visible release bumped the minor version ([versioning](versioning.md)). For the release after a review's fixes the user chose 0.8.1 over 0.9.0, and wants fixes as patch versions from now on.

**Decision:**
- A release with new features or changed behaviour bumps the minor version (0.7 → 0.8).
- A release of fixes and small additions to what is there bumps the patch version (0.8.0 → 0.8.1).
- When unsure which, ask the user; the bump waits for their OK either way.
- The version is bumped in `plugin.json`, `marketplace.json` and the README badge together, with the subject line `agent-crew X.Y.Z: …`.

**Alternatives:** a minor bump for every release, which the user found too big for fixes.

**Consequences:** marketplace installs update on a patch version as on a minor one ([marketplace-install-is-snapshot](../limits/marketplace-install-is-snapshot.md)), and the update check announces either ([update-check](update-check.md)). An unreleased change can still sit on `main` without being announced.
