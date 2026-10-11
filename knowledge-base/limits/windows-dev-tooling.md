---
type: limit
area: windows
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# On this machine, shell scripts mangle edits

**Why:**
- Python isn't installed. `python` is only the Microsoft Store alias.
- Node scripts and bash heredocs that write source files drop backslashes, or turn `\n` and `\0` into real control characters. Some of them failed halfway and wrote nothing. That happened several times, and once more while this knowledge base was written.
- The test engine turns `/work` into `C:\work` on Windows.

**Workaround:**
- Change source and notes with the Edit and Write tools, not with scripts.
- Use node for read-only analysis.
- Path assertions in tests normalise the drive.

**Re-check when:** the development machine changes.
