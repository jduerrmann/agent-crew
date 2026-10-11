---
type: plan
area: files
status: active
priority: 1
effort: S
depends-on: files-tree-navigation
created: 2026-10-11
updated: 2026-10-11
---

# Shut folders show what is inside them: counts by state and the agents' dots

**Goal:** a shut folder tells at a glance whether something happened inside it, as filetree's folders do, so nobody has to open every folder to find the changes.

**Why:** folders start shut ([files-tree-navigation](../../decisions/files-tree-navigation.md)). Without a summary a changed file deep down is invisible until its folder is opened.

**Today:**
- Folder rows are built in `fileRowsOf` in `hooks/register.tsx` (the `if (r.isDir)` branch), with an empty `right` segment list.
- File rows show the agents' dots and the git badge on the right (`agentColor`, `gitBadge`), drawn by `hooks/filerows.tsx`.
- `treeRows` in `hooks/files.ts` knows which files sit under which folder only while it builds the tree. The rows it returns are flat.

**Approach:**
1. Let `treeRows` (or a small helper beside it) return, per folder key, the keys of the files under it, folded chains included.
2. In `fileRowsOf`, for a folder that is shown shut, sum its files: changed (orange ✎ count), new (`+` count), committed (green ✓ count), read only (purple ◉ count), conflicts (red ⚠). Show only what is non-zero, e.g. `✎3 +1 ⚠1`, in the colours of the legend.
3. Add the agents' dots of the files inside, de-duplicated, at most six, as on file rows.
4. Open folders show nothing extra: their files say it themselves.
5. Keep it in the `right` segments, so `filerows.tsx` needs no change.

**Options and text:** no option; it follows the legend. No new text beyond the signs.

**Tests:** a shut folder with one changed and one read file shows `✎1 ◉1`; opening it drops the counts; the dots are those of the agents that touched files inside.

**Risks and open questions:** with the *All* filter a folder can hold thousands of untouched files: count only touched ones. Keep the sums cheap; they run on every render.

**Done when:** in `/crew`, a shut `src/` shows `✎2 ●●` while two of its files are changed by two agents.

**Afterwards:** add a line to [files-tree-navigation](../../decisions/files-tree-navigation.md) (or a superseding note) and delete this plan.
