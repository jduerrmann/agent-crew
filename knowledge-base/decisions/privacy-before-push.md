---
type: decision
area: process
status: active
date: 2026-10-10
decided-by: agreed
updated: 2026-10-11
---

# Nothing personal goes into the public repo

**Context:** the repo is public. A screenshot of the real pane showed the username and local paths.

**Decision:**
- README images are drawn with the mod's own render functions from made-up data, not from screenshots.
- Before every push, the diff is checked for usernames, local paths, session ids and email addresses.
- The demo repository used for images lives outside this folder.

**Alternatives:** blurred screenshots, which still risk leaks and go stale.

**Consequences:** the knowledge base is public too. It names no private paths beyond the repo folder, and no ids or secrets.
