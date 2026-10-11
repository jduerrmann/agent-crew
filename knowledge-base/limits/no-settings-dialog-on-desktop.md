---
type: limit
area: host-api
status: active
verified: 2026-10-10
claude-code: 2.1.296
updated: 2026-10-11
---

# The desktop app has no settings dialog for mods

**Why:** in the desktop app's Code tab, `/config` and `/plugin` don't open their dialogs. Those exist only in the interactive terminal, so options declared in `plugin.json` can't be changed there.

**Workaround:** a settings tab of our own ([settings-tab](../decisions/settings-tab.md)): `/crew-settings` or the ⚙ button. It writes through `$.config.set`, into the same values `/config` uses.

**Re-check when:** the desktop app gets a plugin settings UI.
