---
type: plan
area: files
status: backlog
priority:
effort: S
depends-on:
created: 2026-10-11
updated: 2026-10-11
---

# A file's card can copy its path or put it into the prompt

**Goal:** noted for later. Shorten the way from "I see this file" to "tell Claude something about it".

**Today:** the card has *↗ Open* (`openFile` in `hooks/register.tsx`); an agent's details already have *Copy answer* through `$.ui.copy`.

**Approach:**
- *Copy path*: `$.ui.copy({ text: path, surface })`, relative to the repository when inside it.
- *@ in prompt*: `prompt.fill` (or `$.prompt` methods; check the types) inserts `@path` at the cursor without sending.
- In an agent's details: *Suggest commit*, which fills the prompt with "Commit the changes to …" and the agent's changed files. Nothing is sent on its own.

**Risks and open questions:** check how `prompt.fill` behaves when the person is mid-sentence (insert vs replace). filetree passes selected files as context; look at how.

**Done when:** a file's path reaches the clipboard or the prompt in one press.
