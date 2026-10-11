---
type: limit
area: host-api
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# Settings writes and system notifications can be refused

**Why:**
- `$.config.set` may answer `deny`, and an administrator can lock a setting.
- `$.config.list` is missing on older hosts.
- `$.ui.notify` (a system notification) can report `isSent: false` or throw, for example when the terminal doesn't support it.

**Workaround:**
- A refused write shows as a toast. A locked row shows 🔒 "Set by your administrator".
- Without `config.list`, the settings pane uses the options the mod was loaded with.
- A failed system notification falls back to a toast.

**Re-check when:** never. Keep every call to these guarded.
