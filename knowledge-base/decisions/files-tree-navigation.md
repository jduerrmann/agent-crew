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
- **Filters:** *Activity* (default) shows the files the session's agents read, changed or committed, also the ones read and changed since. *Changes* shows what git reports now, whoever made it, and the session's commits; a file written and restored since leaves it. Outside a repository there is no git to ask, and a file written in the session counts. *All* shows every file under the root, through `git ls-files` or a bounded walk.
- **Activity leaves git's other changes out** (the user's choice): before, it held git's changes as well, so with every read file also changed it showed the same as *Changes*. A change made by a Bash command counts as git's: the mod cannot tell which files a command wrote ([shell-parsing-heuristic](../limits/shell-parsing-heuristic.md)), so it shows under *Changes* only.
- **Folders:** they start shut. A search opens the folders that hold hits. A freshly touched file opens its folders for its shimmer, about 8 s, unless a press shut them since. ⊞/⊟ open or shut every folder in view, and shut means shut. There is no ↻: git is read often enough ([git-read-schedule](git-read-schedule.md)).
- **Narrow panes:** the header's filters wrap to a second line. The legend breaks only between entries: a no-break space ties each sign to its word.
- **Signs:** ◉ read (purple), ✎ changed (orange), `+` new (blue, the user's choice: untracked or staged as added; its badge, folder count and shimmer blue too), ✓ committed (green), ✗ deleted (red, the user's choice over ⊖ and ⌫, as the counterpart of ✓; its badge and shimmer red too). All five stand in the legend. An untouched file (under *All*) has no sign and a bright name, the user's choice: grey with a `·` it looked like the grey folders. Signs are plain text characters that take the colour: an emoji (🗑 was tried) brings its own colours, draws wider and is too small to make out on the desktop.
- **Shut folders sum up:** a shut folder shows, on the right, a count per sign of the files inside it at any depth (`✎2 +1 ✗1 ✓1 ◉3`) in the legend's colours, conflicts as `⚠n`, then the agents' dots (at most six), as filetree's folders do. Untouched files from *All* count for nothing. An open folder shows nothing extra: its rows say it. (`folderSummary` in `register.tsx`, `filesBeneath` in `files.ts`.)
- **Breadcrumbs:** a double press shows only that folder, and breadcrumbs under the search lead back up. They show the main folder with the branch beside it, as a `####` Markdown heading.
- **File card:** two small buttons switch between history and diff, shown only when there is a diff. The card has no heading.
- **Auto-open:** the pane opens at most once per session, on the first file activity (`autoOpenFiles`) or the first subagent (`autoOpen`).

**Alternatives:**
- filetree's ↑ and ⌂ buttons were replaced by breadcrumbs, which the user preferred.
- Hidden files and folder sizes were not taken over: the tree shows the session's files, not a file browser.

**Consequences:** the shimmer had seemed broken once, because shut folders hid it. Hence the hold-open while shimmering. Without the sums a change deep down stayed invisible until its folder was opened.
