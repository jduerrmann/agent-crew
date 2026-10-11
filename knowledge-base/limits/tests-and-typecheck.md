---
type: limit
area: other
status: active
verified: 2026-10-11
claude-code: 2.1.296
updated: 2026-10-11
---

# Type-checking needs the host's types; the test engine has no real git

**Why:**
- `plugins/agent-crew/tsconfig.json` extends `.claude-plugin/types/tsconfig.json`. That file holds about 620 KB of `claude-code` types that the host generates, and git ignores it. In a fresh clone `tsc` has nothing to check against.
- The test engine (`claude-code/testing`) has no real git repository and one `process.run` mock for every command.
- `claude plugin test` transpiles only and checks no types. Five type errors went unnoticed for weeks that way, until a review found them.

**Workaround:**
- Type-check where the host has generated the types, with `npx -p typescript@5.6.3 tsc -p plugins/agent-crew`. `claude plugin validate` and `claude plugin test` run without them. It reports no errors since 2026-10-11; keep it at none.
- The `engine()` helper also takes the panes `$.ui.panes()` lists as open.
- The `engine()` helper in `tests/crew.test.ts` takes a `run` callback with canned git answers.
- Still untested for this reason: large commit lists, migration of conflict data, and the race in *Clear finished*.

**Re-check when:** the types ship as a package, or the test engine gets a git fixture.
