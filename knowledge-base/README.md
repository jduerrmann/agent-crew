# agent-crew knowledge base

What the mod platform and the environment don't allow, and why agent-crew is built the way it is. It's written for whoever changes the code next, human or agent. The rules for keeping it current are in [CLAUDE.md](../CLAUDE.md#knowledge-base). Checklists for tests, releases, conventions and commits are in [workflow](workflow.md).

## How it works

- **`limits/`**: one note per thing that isn't possible or isn't reliable. Each says why, what the code does instead, and when to check again. `status: active | lifted`, `verified:` with the date it was last confirmed.
- **`decisions/`**: one note per choice between real alternatives. Each gives the context, the decision, what lost and what follows. `decided-by: user | agreed | agent`. A replaced decision gets `status: superseded` and a link to its successor; it is never rewritten.
- **`plans/`**: one plan per topic to build. `plans/active/` holds what the user wants built, in `priority:` order; `plans/backlog/` holds what is only noted. A finished plan is deleted once its outcome is a decision or a limit ([plans-in-knowledge-base](decisions/plans-in-knowledge-base.md)).
- **`templates/`**: start new notes and plans from these.

Rules:
- One topic per note. File names are kebab-case claims with no dates.
- Every note has a line in the index below. A hook line is at most 140 characters: the claim plus search words; the reasons stay in the note.
- Notes describe the current state. History lives in git, and the commit hash goes in the note where it helps.
- English, like the code. Nothing personal: the repo is public ([privacy-before-push](decisions/privacy-before-push.md)).
- To find something, grep: `rg -il "<word>" knowledge-base`, or `rg -l "^area: windows" knowledge-base`.

## Limits

### Rendering and input
- [desktop-text-is-proportional](limits/desktop-text-is-proportional.md): desktop text isn't monospace, so box-drawing tabs and `─` rules break; use Boxes and SVG there
- [builtin-components-fixed](limits/builtin-components-fixed.md): SVG takes no clicks, Input always has a submit button, no font size, Box borders all round, pane scrolls whole
- [no-pixel-width](limits/no-pixel-width.md): only `bodyColumns` is known, no pixels; ~8 px per column, text widths estimated
- [surface-features-vary](limits/surface-features-vary.md): Svg, Client, Markdown and Input can be missing (VS Code, mobile); feature-test, always a fallback
- [client-no-blur-event](limits/client-no-blur-event.md): a Client never hears it lost the keys; the hooks module guesses focus from other input
- [client-posts-per-frame](limits/client-posts-per-frame.md): Client posts arrive once per frame and props trail typing; props must be plain data
- [redraw-drops-button-clicks](limits/redraw-drops-button-clicks.md): a redraw between press and release loses a Button click; rows and tabs are hotspot.tsx Clients
- [svg-redraw-restarts-animation](limits/svg-redraw-restarts-animation.md): desktop reloads every Svg per redraw; dots pulse in Clients, crabs walk as a 4/s flip book, bar glides 1 s

### Host API
- [onpress-work-dropped](limits/onpress-work-dropped.md): async work started in onPress dies with the press; schedule it with `$.clock.after(1, …)`
- [one-hook-per-event](limits/one-hook-per-event.md): a plugin gets one handler per event; a second `ui.message` hook is refused
- [subagents-events-only](limits/subagents-events-only.md): agents only via `agent.spawn` and `$.agent.list()`; the list lacks model and start time and lags
- [no-cost-from-engine](limits/no-cost-from-engine.md): the engine gives tokens, not money or context window; estimated from `PRICES`
- [usage-arrives-late](limits/usage-arrives-late.md): usage figures come only after a main-thread turn; empty until the first `session.measure`
- [no-outside-change-events](limits/no-outside-change-events.md): no event for commits or edits made outside the session; git is polled while the pane is open
- [open-file-per-os](limits/open-file-per-os.md): no open-in-editor call; the system's default app, via PowerShell, `open` or `xdg-open`
- [pane-title-sticks](limits/pane-title-sticks.md): an open pane keeps its old title after a reload or language change; reopen it
- [settings-and-notify-can-fail](limits/settings-and-notify-can-fail.md): `config.set` can be denied or admin-locked, `config.list` missing, `notify` unsent
- [no-settings-dialog-on-desktop](limits/no-settings-dialog-on-desktop.md): `/config` and `/plugin` dialogs exist only in the terminal; hence the settings tab
- [store-json-4mib](limits/store-json-4mib.md): the plugin store is JSON only, 4 MiB; caps on runs, files, logs, diffs and the All tree

### Plugin loading and updates
- [plugin-dirs-at-session-start](limits/plugin-dirs-at-session-start.md): `CLAUDE_CODE_PLUGIN_DIRS` is read at session start, hot reload needs the user's OK; id `agent-crew@inline`
- [marketplace-install-is-snapshot](limits/marketplace-install-is-snapshot.md): a marketplace install is a cached copy, even from a local folder; it updates only on a new version
- [folder-copy-no-self-update](limits/folder-copy-no-self-update.md): only cache installs can update themselves; a folder copy is told to `git pull`

### Windows, git, shell
- [windows-no-lang](limits/windows-no-lang.md): Windows sets no LANG; language from option, Claude Code setting, locale vars, Intl
- [path-spellings](limits/path-spellings.md): case folding, `/c/` vs `C:\`, packaged-app AppData redirection; root from `--show-cdup`
- [git-edge-cases](limits/git-edge-cases.md): empty repo, failed call ≠ empty, checkout ≠ commit, renames with two paths, no optional locks
- [shell-parsing-heuristic](limits/shell-parsing-heuristic.md): file access in Bash/PowerShell is guessed; escapes, subshells, `$(…)`, heredocs left out
- [windows-dev-tooling](limits/windows-dev-tooling.md): no Python here; scripts and heredocs mangle backslashes, so edit with Edit/Write
- [tests-and-typecheck](limits/tests-and-typecheck.md): `tsc` needs the host-generated types; the test engine has no real git, canned `run` answers

## Decisions

### Product and UI
- [own-mod-one-pane](decisions/own-mod-one-pane.md): a mod of our own, not savvy; one pane for agents, timeline, files, usage; one hooks module
- [configurable-sections](decisions/configurable-sections.md): framed sections, each with a switch; new features come with an option
- [svg-desktop-text-terminal](decisions/svg-desktop-text-terminal.md): SVG with CSS animation on desktop, the same content as text in the terminal; timeline folds pauses
- [settings-tab](decisions/settings-tab.md): `/crew-settings` tab and ⚙ button, written through `$.config.set` like `/config`
- [cost-is-an-estimate](decisions/cost-is-an-estimate.md): cost marked `≈` from `PRICES`; the cost section is off by default (user)
- [tokens-new-vs-cached](decisions/tokens-new-vs-cached.md): new = input + output + cache writes, cached reads apart; one sum was misleading
- [crab-flip-book](decisions/crab-flip-book.md): desktop crabs walk as stills redrawn 4×/s while agents run; `crabMotion` light = 1×/s (user)
- [agent-bar-estimate](decisions/agent-bar-estimate.md): row bar estimates from time and steps up to 90 %; savvy `step` reports fill it for real; green/red/grey at the end (user)
- [agent-bar-no-made-up-progress](decisions/agent-bar-no-made-up-progress.md): superseded; a moving band instead of a fill, found too restless

### Files
- [client-file-rows](decisions/client-file-rows.md): file rows as a Client like filetree: clickable while shimmering, double click opens
- [own-search-field](decisions/own-search-field.md): full-width search as a Client; Input always shows a submit button
- [files-tree-navigation](decisions/files-tree-navigation.md): folders shut but sum up (✎3 ◉1 ●●), filters Activity/Changes/All, breadcrumbs, card with history and diff
- [conflict-window](decisions/conflict-window.md): two writers on one file within 10 minutes is a conflict until a commit
- [git-read-schedule](decisions/git-read-schedule.md): git read 500 ms after changes, every 10 s while open, on ↻; single-flight

### Release and process
- [update-check](decisions/update-check.md): daily check against GitHub `plugin.json`; marketplace installs update, folder copies get `git pull`
- [versioning](decisions/versioning.md): minor bump per user-visible release, in plugin.json, marketplace.json and badge, after the user's OK
- [load-from-working-copy](decisions/load-from-working-copy.md): the user runs the working copy via `CLAUDE_CODE_PLUGIN_DIRS`; no marketplace install
- [license-polyform-noncommercial](decisions/license-polyform-noncommercial.md): PolyForm Noncommercial so nobody monetises it; savvy and filetree parts stay MIT
- [repo-name](decisions/repo-name.md): repo and marketplace `agent-crew`, local folder stays `claude-mods`; commits as jduerrmann
- [privacy-before-push](decisions/privacy-before-push.md): README images rendered from made-up data; check the diff for personal data before a push
- [review-and-verification](decisions/review-and-verification.md): check review findings against the code; every fix brings a regression test
- [plans-in-knowledge-base](decisions/plans-in-knowledge-base.md): ideas live as plans, active or backlog, one per topic; deleted once done
- [no-token-cost](decisions/no-token-cost.md): the mod never calls a model; no summaries or other features that spend tokens (user)

## Plans

Read a plan, the notes it links and the code it points to before starting; check its pointers against the code first.

### Active, in order
3. [prompt-band](plans/active/prompt-band.md): a band above the prompt with crew status, progress and usage, each line optional; status line switchable (M)
4. [agent-rows-and-stop](plans/active/agent-rows-and-stop.md): click anywhere on an agent's row; ■ stops a subagent (spike: turn.abort, TaskStop, deny) (M)
5. [burn-rate](plans/active/burn-rate.md): forecast when a limit runs out at the current pace; optional cost limit per agent (M)
6. [file-lock](plans/active/file-lock.md): optional lock refuses a second agent's edit of a file another running agent is changing (M)

### Backlog
- [review-per-agent](plans/backlog/review-per-agent.md): an agent's changes in its details, to stage or discard (L)
- [keyboard-control](plans/backlog/keyboard-control.md): arrows, Enter, o, c, /, 1–3 in the file rows and agent rows (M)
- [copy-path-and-prompt](plans/backlog/copy-path-and-prompt.md): copy a file's path or put `@path` into the prompt; suggest a commit (S)
- [filters-since-and-agent-chips](plans/backlog/filters-since-and-agent-chips.md): filter to this round or since the last commit; a chip per agent (M)
- [open-with-and-preview](plans/backlog/open-with-and-preview.md): open in the person's editor at the changed line; Markdown preview in the card (M)
- [readme-images-refresh](plans/backlog/readme-images-refresh.md): redraw the README pictures for today's files section and settings (S)
- [posix-absolute-paths](plans/backlog/posix-absolute-paths.md): on macOS and Linux, `/etc/hosts` stops merging into a repo folder `etc/` (M)

## Open questions

Never checked; check them before building on them, then turn the answer into a limit or a decision.

- Can a mod stop a subagent, or send a message to one that is waiting? Needed for a stop button in the pane; the spike is step 1 of [agent-rows-and-stop](plans/active/agent-rows-and-stop.md).
- Does the update button work end to end against a real `claude`? The tests mock the command.
- Do mods load in WSL sessions of the desktop app? filetree's README says no.
