---
type: decision
area: release
status: active
date: 2026-10-10
decided-by: user
updated: 2026-10-11
---

# PolyForm Noncommercial 1.0.0, with upstream parts kept MIT

**Context:** the user wants everyone to be able to download and develop agent-crew further, but nobody to make money with it ("nur nicht monetarisieren").

**Decision:** agent-crew is licensed under PolyForm Noncommercial 1.0.0 (`LICENSE.md`). Parts derived from MIT projects keep their notices in `NOTICE`:
- from savvy-progress and savvy-flow by johnnyvizz: `hooks/crab.ts`
- from filetree by Kurt Buhler: shell parsing in `hooks/files.ts`, the shimmer, the search line and `filerows.tsx`

The README credits both.

**Alternatives:** MIT was planned first, but it allows commercial use.

**Consequences:** code from other projects needs a compatible license and a `NOTICE` entry. PolyForm is not an open-source license in the OSI sense. The README spells out what it allows and what it doesn't.
