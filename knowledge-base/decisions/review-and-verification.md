---
type: decision
area: process
status: active
date: 2026-10-11
decided-by: user
updated: 2026-10-11
---

# Review findings are checked against the code; a fix brings a test

**Context:** the user runs changes through Codex and pastes the findings, asking whether they hold ("sind die Anliegen berechtigt?"). They check the result in the app with screenshots, often after starting a few subagents to see the pane at work.

**Decision:**
- Each finding is checked against the code before it is fixed or rejected, with the reason.
- A fix comes with a regression test that fails on the old code.
- Before reporting done: `claude plugin validate`, `claude plugin test` and, where the types exist, `tsc`.
- Say plainly when a change has not been seen in the real app.

**Alternatives:** none.

**Consequences:** test-only checks are not reported as "works in the app".
