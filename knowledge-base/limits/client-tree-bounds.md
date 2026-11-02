---
type: limit
area: rendering
status: active
verified: 2026-11-02
claude-code: 2.1.296
updated: 2026-11-02
---

# A Client's tree may hold 20,000 nodes, 32 levels and 100,000 characters

**Why:** the host checks every tree a surface module returns against these bounds (`ClientElements` in the generated types). A tree past them unmounts the instance, and the pane shows "returned a tree the page cannot draw (malformed or past its bounds)" in its place. `surface.post` has the same bounds. The file rows hit the character limit: 80 fresh files in one Client, one `Text` a shimmering letter. The test engine reports it as "a tree serializing to more than 100000 characters".

**Workaround:**
- `hooks/filerows.tsx` gives letters of one shimmer colour one `Text`, so a name takes a handful of nodes, not one per letter.
- `rowsClient` in `hooks/register.tsx` gives each Client at most `ROWS_PER_CLIENT` (20) rows: `rows-a`, `rows-a-2`, …, one below the other. A fresh row with one agent serialized to about 800 characters; six agents, a badge and a shimmer band inside the name add a few hundred more, so 20 rows stay far within the limit, 80 did not. Presses go to every key starting with `rows-`.
- Tested in "a page of fresh files with long names stays within what a rows Client may draw".

**Re-check when:** the host raises the bounds, or a Client's tree grows per row (more segments, longer props).
