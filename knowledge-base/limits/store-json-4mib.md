---
type: limit
area: host-api
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# The plugin store holds JSON only, up to 4 MiB

**Why:** atoms are stored as JSON, so `undefined` fields are dropped. The whole store is capped at 4 MiB.

**Workaround:** everything that grows has a hard cap:

| What | Cap |
| --- | --- |
| Runs (`MAX_RUNS`) | 300 |
| Files (`MAX_FILES`) | 400 |
| Actions per run (`MAX_LOG`) | 40 |
| Text (`MAX_TEXT`) | 4000 chars |
| Diff (`MAX_DIFF`) | 30k |
| Cleared run ids | 2000 |
| Untracked sources read | up to 256 KB, and not binary |
| The *All* filter | 4000 files, walking at most 300 folders, 6 deep |

Writes are skipped when nothing changed. State is merged over `PANEL_DEFAULT` on read, since older versions lack newer fields.

**Re-check when:** the store limit changes. New state that grows needs a cap.
