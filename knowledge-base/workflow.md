---
type: guide
updated: 2026-10-11
---

# Workflow: test, release, conventions

The checklists behind the short rules in [CLAUDE.md](../CLAUDE.md).

## Build and test

```bash
claude plugin validate plugins/agent-crew
claude plugin test plugins/agent-crew
```

- **What the tests do:** they drive the mod against a mocked engine (`claude-code/testing`) on both surfaces, `terminal` and `desktop`.
  - `tests/crew.test.ts` holds the pane tests. Expected strings are German, because the engine sets `LANG=de_DE.UTF-8`.
  - `tests/shell.test.ts` tables the shell parsing.
- **Tests with a change:** a change in behaviour comes with a test. A fixed bug comes with a test that fails on the old code.
- **Type-check:** where the host has generated the types, run `npx -p typescript@5.6.3 tsc -p plugins/agent-crew` ([tests-and-typecheck](limits/tests-and-typecheck.md)).
- **Review findings:** findings, such as the Codex reviews the user pastes, are checked against the code before they are fixed or rejected ([review-and-verification](decisions/review-and-verification.md)).
- **Reporting:** say plainly whether a change was seen in the real app or only in tests.
- **Live loading:** the user loads the working copy live ([load-from-working-copy](decisions/load-from-working-copy.md)), so edits show up in their sessions at once. Never edit an old copy under `~/.claude/dev-mods/`.

## Release

- **Version:** bump it in three places together: `plugins/agent-crew/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` and the badge at the top of `README.md`. The bump waits for the user's OK ([versioning](decisions/versioning.md)).
- **Announcement:** pushing `plugin.json` with a new version announces the release to every installed copy ([update-check](decisions/update-check.md)).
- **New or changed option:** it goes into all of these:
  - `plugin.json` (`userConfig`)
  - the settings tab
  - the options table in `plugins/agent-crew/README.md`
  - `README.md`, if users see it
- **Pane text:** it exists in German and English (`STRINGS` and `FIELD_TEXT` in `hooks/register.tsx`). Change both. `plugin.json` titles stay English.

## Code conventions

- **Comments:** full sentences in British English that say what something does and why. JSDoc goes only on types, constants and exported helpers.
- **Keys:** every JSX element gets a stable `key`. Tests find elements by it.
- **Surface components:** each one (`Svg`, `Client`, `Markdown`, `Input` …) is feature-tested before use and has a fallback ([surface-features-vary](limits/surface-features-vary.md)).
- **Options:** read them as `opts.x !== false` when the default is on and `=== true` when it is off.
- **Persisted fields:** new ones need a default in `PANEL_DEFAULT`, because state from older versions lacks them. Anything that grows needs a cap ([store-json-4mib](limits/store-json-4mib.md)).
- **Background calls:** write fire-and-forget calls as `void f().catch(() => undefined)`. Skip writes when nothing changed.
- **Licensing:** code taken from other projects needs a compatible license and an entry in `NOTICE` ([license](decisions/license-polyform-noncommercial.md)).

## Commits

- **Message:** English, in the style of the history. A short subject (`agent-crew 0.6.0: …` for a release, `Files: …` for an area), then a bullet list of what users notice.
- **Privacy:** before a push, check the diff for usernames, local paths, session ids and email addresses ([privacy-before-push](decisions/privacy-before-push.md)).
