---
type: decision
area: files
status: active
date: 2026-10-11
decided-by: user
updated: 2026-10-11
---

# Files tree: shut folders, three filters, breadcrumbs, a card with two tabs

**Context:** the tree got long, and the user wanted filetree's navigation without its clutter.

**Decision:**
- **Filters:** *Activity* (default) shows the session's files. *Changes* shows what git reports. *All* shows every file under the root, through `git ls-files` or a bounded walk.
- **Folders:** they start shut. A search opens the folders that hold hits. A freshly touched file opens its folders for its shimmer, about 8 s, unless a press shut them since. ⊞/⊟ open or shut every folder in view, and shut means shut. ↻ reads git again.
- **Breadcrumbs:** a double press shows only that folder, and breadcrumbs under the search lead back up. They show the main folder with the branch beside it, as a `####` Markdown heading.
- **File card:** two small buttons switch between history and diff, shown only when there is a diff. The card has no heading.
- **Auto-open:** the pane opens at most once per session, on the first file activity (`autoOpenFiles`) or the first subagent (`autoOpen`).

**Alternatives:**
- filetree's ↑ and ⌂ buttons were replaced by breadcrumbs, which the user preferred.
- Hidden files and folder sizes were not taken over: the tree shows the session's files, not a file browser.

**Consequences:** the shimmer had seemed broken once, because shut folders hid it. Hence the hold-open while shimmering.
