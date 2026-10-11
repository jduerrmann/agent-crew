---
type: plan
area: ui
status: active
priority: 3
effort: M
depends-on: agent-bar-estimate, configurable-sections
created: 2026-10-11
updated: 2026-10-11
---

# A band above the prompt shows the crew, its progress and the usage, each line optional

**Goal:** the user wants the state visible without the pane, above the chat's prompt:
- a status line for the crew ("● 3 running · ✗ 1 · ⚠ 2 conflicts"), configurable;
- the usage (context, 5-hour, week) above the prompt, configurable;
- a progress line that sums up the subagents, configurable, as the pane's rows do.

**Why:** the pane is often closed or on another tab. What matters while agents run should sit where the person types.

**Today:**
- `refreshStatus` in `hooks/register.tsx` already sets a status entry with `$.ui.status` (`🦀 N Subagenten aktiv`). It always runs; there is no option.
- The usage meters are built by `metersOf` and drawn in the pane (`usageSvg` on the desktop, text rows in the terminal).
- Nothing draws above the prompt yet. The platform offers a band: a `ui.render` hook on `{ component: 'AbovePrompt' }` that returns a tree, or `next(e)` for nothing. The plugin-authoring skill's `examples/band.tsx` shows one; read it first.

**Approach:**
1. Spike: draw a one-line band from a `ui.render` hook on `AbovePrompt` on both surfaces; check its width, how often it redraws, and that `next(e)` hides it cleanly. Note what the desktop and the terminal allow ([surface-features-vary](../../limits/surface-features-vary.md)).
2. Options, all in a new settings group *Above the prompt* (`group: 'band'`):
   - `bandAgents` (default on): `● 3 running · ✓ 5 · ✗ 1`, coloured; hidden when no agent ran this session.
   - `bandProgress` (default off): one compact line of the running agents, a short bar each in its colour, taken from `barOf`, as [agent-bar-estimate](../../decisions/agent-bar-estimate.md) settled what a bar means.
   - `bandUsage` (default off): `ctx 31% · 5h 83% (1h 20m) · week 12%`, coloured by the meter thresholds, respecting `usageContext`/`usageFiveHour`/`usageWeek`.
   - `statusLine` (default on): the existing `$.ui.status` entry, now switchable.
3. Keep the band to one line per enabled part, at most three, and nothing at all when every part is off or empty.
4. A press on the band opens `/crew` (a Button on the line, or `ui.press`).
5. Draw from the same atoms as the pane, so both stay in step; mind the redraw rate (`now` ticks every second only while something runs).

**Options and text:** four options as above in `plugin.json`, `FIELDS`, `FIELD_TEXT` (de/en), both READMEs; band text in `STRINGS` de/en.

**Tests:** each option shows or hides its line on `terminal` and `desktop`; with all off the hook answers `next(e)`; usage colours follow the thresholds; a press opens the pane.

**Risks and open questions:**
- Other mods may draw an `AbovePrompt` band too (savvy-progress?). Check how two bands combine and that agent-crew's doesn't push others away.
- Does the band redraw while the main turn streams, or only between turns?

**Done when:** with the pane closed, the user sees running agents and the 5-hour limit above the prompt, and can turn each line off in `/crew-settings`.

**Afterwards:** a decision note on the band; a limit note for whatever the band can't do; delete this plan.
