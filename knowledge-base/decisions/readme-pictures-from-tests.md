---
type: decision
area: release
status: active
date: 2026-10-11
decided-by: agent
supersedes:
updated: 2026-10-11
---

# The README's pictures are drawn by the mod in a test, laid out by a small renderer

**Context:** the pictures in `media/` were drawn once by a script that was never kept, and went stale as the pane changed. The user asked for new ones that match what the mod does, the crab banner too.

**Decision:**
- `tests/media.test.ts` plays one made-up session per picture, mounts the desktop pane (or the band, or the settings) and takes what it drew.
- `tests/render.ts` lays that tree out as one SVG: Boxes, Texts and Buttons by a rough flexbox at about 8 px a column, the Clients (file rows, search field, click regions) as they draw themselves, and the mod's own Svg pictures as they are, their crabs walking and their animation names made unique.
- The pictures follow the light or dark colour scheme, as the mod's own pictures do. Section pictures leave out the pane's Settings line; the settings picture shows the first three groups.
- The crab banner (`crew.svg`) is drawn with `crab()` from `hooks/crab.ts`, one costume per type in its type's colour.
- Off (`RENDER = false`), the scenes run with the other tests, so a picture that no longer draws fails there.

**Alternatives:**
- Hand-drawn SVGs: they drift from the pane, as the old ones did.
- Screenshots of the real app: personal data and stale quickly ([privacy-before-push](privacy-before-push.md)).
- A script outside the tests: it can't load the mod; only the test kit can ([tests-cannot-write-files](../limits/tests-cannot-write-files.md)).

**Consequences:** the layout is an estimate of the desktop's; text widths come from `textWidth`. A new element type or Client in the pane needs a case in `render.ts`, or it is left out of the pictures. Redraw the pictures with any change they show ([workflow](../workflow.md#readme-pictures)).
