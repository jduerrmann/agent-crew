---
type: limit
area: plugin-loading
status: active
verified: 2026-11-11
claude-code: 2.1.321
updated: 2026-11-11
---

# A mod can't count on starting `claude` by name

**Why:** the update button ran `claude plugin …` through `$.process.run`, and in the desktop app it failed on another machine. Two reasons, seen on Windows:
- **The desktop app's own Claude Code isn't on the PATH.** It lives in the app's data folder: `%LOCALAPPDATA%\Claude-Data\claude_<app id>\claude-code\<version>\<build>\claude.exe`. Older apps used `%APPDATA%\Claude\claude-code\<version>\`. Someone who only has the desktop app has no `claude` on the PATH at all.
- **`$.process.run` starts without a shell.** An npm install of the CLI is only a shim, `claude.cmd`, which needs `cmd` to start. A bare `claude` gives `ENOENT`, and `claude.cmd` gives `EINVAL`.

The terminal works because the person's shell finds the shim there.

**Workaround:** `hooks/update.ts` tries several ways in, and asks each for `--version` first. It takes the first that answers `(Claude Code)`:
1. On Windows, the desktop app's binary for the session's version (`$.session.version()`), found with `$.fs.list` under `LOCALAPPDATA` and `APPDATA`.
2. `claude` on the PATH.
3. The native installer's `~/.local/bin/claude`.
4. On Windows, `cmd.exe /d /s /c claude`, which finds the shim.

If none answers, or a step fails, the settings tab shows the two commands to type in a terminal. Tests are in `tests/update.test.ts`.

**Checked by hand on Windows:** without a shell, the desktop binary and the `cmd` route answer `--version` and `plugin marketplace list`, and a bare `claude` gives `ENOENT`.

**Not verified:**
- A whole update with reload from the desktop app.
- Where the desktop app on macOS keeps its Claude Code. A GUI app there gets a short PATH, so only `~/.local/bin` helps.

**Re-check when:** the host offers its own path or a plugin-update call, or the desktop app puts its CLI on the PATH.
