---
type: limit
area: input
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# Client posts reach the hooks once per frame, and props must be plain data

**Why:** what a Client posts is delivered to the hooks module at most once per frame. When someone types fast, the props that come back trail the field's own text. Props cross a boundary too: `undefined` and `false` fields are stripped.

**Workaround:**
- `hooks/searchbox.tsx` keeps the texts it posted (`posted`), so an older echo can't rewind the field, and each key also posts `focus: true`.
- `plainSeg` in `hooks/register.tsx` strips segments down to plain data before they go to a Client.

**Re-check when:** the Client API changes how posts are delivered.
