---
type: limit
area: host-api
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# Files can't be opened in the editor, only in the system's app

**Why:** the host has no call that opens a file in the person's editor or IDE. We searched the API and found none. All that's left is the OS's own opener through `process.run`, and quoting a path safely for `cmd` or PowerShell is error-prone.

**Workaround:** a double click opens the file in the system's default app, as filetree does. The OS comes from the Windows fold, else from `uname -s`.
- **Windows:** the path travels in the environment variable `CREW_OPEN_TARGET` to PowerShell's `Process.Start`, so it is never quoted into the command.
- **macOS:** `open`.
- **Linux:** `setsid -f xdg-open`, so the app outlives the call.

See `openCommand` in `hooks/files.ts`.

**Re-check when:** the host offers an open-in-editor call.
