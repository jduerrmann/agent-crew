---
type: plan
area: release
status: backlog
priority:
effort: S
depends-on: privacy-before-push
created: 2026-10-11
updated: 2026-10-11
---

# The README's pictures show the pane as it looks now

**Goal:** the images in `media/` still show the files section before 0.5–0.7: no filter buttons, breadcrumbs, search field, card tabs or folder state, and the settings without the *Version* group.

**Approach:**
- Redraw `media/files.svg`, `media/settings.svg` and `media/panel.svg` from made-up data, never from a real session ([privacy-before-push](../../decisions/privacy-before-push.md)).
- Match today's look: Client rows as text on the desktop, filter buttons, breadcrumbs with branch, card with *History / Changes* and *↗ Open*, coloured legend with its rule.
- Do it after the active plans that change the look (folder counters, prompt band), so the pictures are drawn once.

**Done when:** each README picture matches what `/crew` shows today.
