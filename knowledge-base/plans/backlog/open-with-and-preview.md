---
type: plan
area: files
status: backlog
priority:
effort: M
depends-on:
created: 2026-10-11
updated: 2026-10-11
---

# Files open in the person's editor at the changed line, and Markdown previews in the card

**Goal:** noted for later. Today *Open* starts the system's default app ([open-file-per-os](../../limits/open-file-per-os.md)), which is often not the editor and never at the change.

**Approach:**
- Option `openWith`: a command with `{path}` and `{line}`, e.g. `code -g {path}:{line}`, `cursor -g …`, `idea --line {line} {path}`. Empty means the system's default as today.
- `{line}` is the first changed line, from the first `@@` hunk of the file's diff.
- Run it with `$.process.run` as an argument list, never through a shell string; split the option on spaces with quotes respected.
- Card preview: a *Preview* tab for Markdown (`Markdown`) and source (`Code`), read with the same size and binary guard as untracked files.

**Risks and open questions:** quoting on Windows; an editor that isn't on `PATH`. filetree has both features; look at its option.

**Done when:** a double click opens VS Code at the first changed line, when the option says so.
