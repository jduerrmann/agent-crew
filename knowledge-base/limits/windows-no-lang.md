---
type: limit
area: windows
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# Windows has no LANG

**Why:** Windows sets no `LANG`, `LC_ALL` or `LC_MESSAGES`. Reading only the environment made the pane fall back to English for a German user.

**Workaround:** the language comes from the first of these that gives one:
1. the `language` option
2. Claude Code's own language setting (`$.settings.read().language`)
3. the locale variables
4. the `Intl` locale
5. English

**Re-check when:** the host passes a UI language to mods.
