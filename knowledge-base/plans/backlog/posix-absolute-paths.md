---
type: plan
area: files
status: backlog
priority:
effort: M
depends-on: path-spellings
created: 2026-10-11
updated: 2026-10-11
---

# Files outside the repository on macOS and Linux get a tree of their own

**Goal:** close the gap recorded in [path-spellings](../../limits/path-spellings.md): a file such as `/etc/hosts` lands in a repo folder `etc/` of the same name, and entering that folder mixes both.

**Today:** labels outside the repository keep their absolute path (`/etc/hosts`); `treeRows`, `underFolder`, `folderKeys` and the breadcrumbs in `hooks/files.ts` and `hooks/register.tsx` drop the leading `/`. On Windows such labels start with `C:` and don't collide.

**Approach:**
- One root segment for absolute labels (shown as `/`), handled the same way in all five places: `treeRows` (folding the name), `rowsUnder`, `underFolder`, `folderKeys` and the breadcrumbs (`folderUrl`, the step list).
- A test per place, with labels `/etc/hosts` and `etc/app.conf` side by side.

**Done when:** on Linux, `/etc/hosts` and the repo's `etc/` show as two folders, and entering either shows only its own files.
