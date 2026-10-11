---
type: decision
area: settings
status: active
date: 2026-10-10
decided-by: agent
updated: 2026-10-11
---

# Settings live in a tab of the mod, written through $.config.set

**Context:** the desktop app has no settings dialog for mods ([no-settings-dialog-on-desktop](../limits/no-settings-dialog-on-desktop.md)). The user asked for an "/agent-crew-configure skill oder so".

**Decision:** `/crew-settings` and a ⚙ button open a settings tab. It has groups (Sections, Usage, General, Notifications, Version). It writes through `$.config.set` into the same values as `/config` (`pluginConfigs.<id>.options`), applies at once, and bumps `settingsRev` so every pane redraws.

**Alternatives:** a skill that edits `settings.json`. It is slower, can't be clicked, and bypasses the host's checks and admin locks.

**Consequences:** refused writes and admin-locked rows must be handled ([settings-and-notify-can-fail](../limits/settings-and-notify-can-fail.md)). Every option needs a row in the tab.
