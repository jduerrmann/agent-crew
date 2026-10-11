---
type: limit
area: rendering
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# Not every surface has every component

**Why:** `Svg`, `Client`, `Markdown`, `Code` and `Input` may each be missing on a surface (terminal, desktop, others), and a host may be older than the types. For example, VS Code and mobile have no `Client`.

**Workaround:** every use is feature-tested (`'Svg' in ui`, `'Client' in ui` …) and falls back to text or Buttons. The desktop gets SVG, the terminal text. Tests run on both surfaces (`SURFACES` in `tests/crew.test.ts`).

**Re-check when:** never. New code follows the same rule.
