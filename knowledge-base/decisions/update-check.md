---
type: decision
area: release
status: active
date: 2026-10-11
decided-by: agreed
updated: 2026-11-11
---

# The mod checks GitHub daily, and updates only marketplace installs

**Context:** marketplace users don't learn about a new version on their own ([marketplace-install-is-snapshot](../limits/marketplace-install-is-snapshot.md)). The user asked for a notice and an update from the settings.

**Decision:**
- **Check:** 5 s after start, so the first turn isn't held up, then at most once a day. The mod compares its version with the `plugin.json` on GitHub `main`, through `$.http`.
- **Failures:** a failed check retries after 30 minutes. One check runs at a time.
- **Notice:** shown once per version, as **↑ version** beside *Settings*.
- **Version group:** checks on demand. A marketplace install updates and reloads; a folder copy points to `git pull` ([folder-copy-no-self-update](../limits/folder-copy-no-self-update.md)).
- **`checkUpdates: false`:** skips the daily check; the button still works.
- **The button stays (user, 2026-11-11):** it failed in the desktop app because no `claude` could be started by name. It now looks for one that starts, and shows the commands to type when none does ([claude-not-startable-by-name](../limits/claude-not-startable-by-name.md)).

**Alternatives:**
- **No check:** users keep old versions.
- **Updating folder copies:** unsafe, because they may hold uncommitted work.
- **Claude Code's own marketplace auto-update:** it updates a marketplace's plugins at startup. It is off by default for marketplaces like ours, and is switched on per marketplace in the terminal's `/plugin` or with `autoUpdate: true` in `extraKnownMarketplaces`. The user preferred repairing the button to sending users there.

**Consequences:** pushing `plugin.json` with a new version announces a release to everyone. Bump it only for a real release.
