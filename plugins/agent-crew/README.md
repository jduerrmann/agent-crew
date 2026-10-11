# agent-crew

A Claude Code mod: one pane (`/crew`) for the session's subagents, the files they touch, and the session's usage and cost. The [repository README](../../README.md) has screenshots and the full description.

## Sections

Each section can be switched on or off in the settings.

- **Usage:** context fill and the plan's 5-hour and weekly limits with their reset times, and a `/compact` button. Each meter can be hidden on its own. Warnings when a limit passes 80 % and 95 %, and when the context passes 85 %.
- **Cost** (off by default): main chat and subagents separately, new and cached tokens, and the total. Costs are estimated from the `PRICES` table in `hooks/register.tsx`.
- **Subagents:** every subagent, whichever way it started (Agent tool, forks, teammates, background and workflow agents, nested agents, and agents only `$.agent.list()` knows), in *Active* and *Finished* tabs. A row's bar is an estimate from run time and model requests while the agent runs, kept short of 90 %. Where a worker reports its steps through savvy-progress's `step` tool, the bar shows those instead. Once the agent ends, the bar is full in green, red or grey. Expanding a row shows the task, recent actions, files and the final answer. *Clear finished* removes finished agents; their cost stays in the totals.
- **Timeline:** when each agent ran, on one time axis, with long pauses folded.
- **Files:** a tree of the files read, changed and committed during the session, plus the files git reports as changed. Clicking a file shows its history and its diff against `HEAD`; double-clicking opens it in the system's default app. A search line narrows it; a file just touched shimmers, and its folders open while it does. Folders start collapsed and open on a click; a double-click shows only that folder, and the breadcrumbs under the search (main folder and branch) lead back up. ⊞/⊟ expand or collapse every folder, ↻ reads git again. Filters: *Activity* (default), *Changes*, or *All* files under the root. Two agents changing the same file within ten minutes is marked as a conflict until it is committed.

Reads come from `Read`, `Grep` results and shell readers (`cat`, `head`, `sed`, `rg`, `Get-Content` and others); writes from `Edit`, `Write` and `NotebookEdit`. Git is read after writes and commands that may change the tree, and every ten seconds while the pane is open.

## Options

`/crew-settings`, or the *Settings* button in the pane, opens the settings with the groups *Sections*, *Usage*, *General*, *Notifications* and *Version*. Changes apply immediately and are the same values as in `/config` or `pluginConfigs.agent-crew.options` in `~/.claude/settings.json`.

| Option | Default | Description |
| --- | --- | --- |
| `showUsage` | `true` | Usage section |
| `showTotals` | `false` | Cost section |
| `showAgents` | `true` | Subagents section |
| `showTimeline` | `true` | Timeline section |
| `showFiles` | `true` | Files section |
| `usageContext` | `true` | Context meter |
| `usageFiveHour` | `true` | 5-hour limit meter |
| `usageWeek` | `true` | Weekly limit meters |
| `autoOpen` | `true` | Open the pane on the first subagent of a session |
| `autoOpenFiles` | `true` | Open the pane on the first file read or changed in a session |
| `language` | `auto` | `auto`, `de` or `en` |
| `crabMotion` | `smooth` | `smooth`: on the desktop the pane redraws four times a second while an agent runs, so the crabs walk evenly; `light`: once a second, the crabs' step starting over each time |
| `notifyAgents` | `background` | `off`, `failures`, `background`, `all` |
| `notifyVia` | `toast` | `toast`, or `system` for the terminal's or system's notification |
| `limitWarnings` | `true` | Warnings at 80 % and 95 % of a limit and at 85 % context |
| `warnConflicts` | `true` | Notice on conflicting edits |
| `checkUpdates` | `true` | Daily check for a new version; the settings pane installs it |

## Install

```bash
claude plugin marketplace add jduerrmann/agent-crew
claude plugin install agent-crew@agent-crew
```

## Acknowledgements

- **[savvy-progress](https://github.com/johnnyvizz/claude-kit/tree/main/plugins/savvy-progress)** by [johnnyvizz](https://github.com/johnnyvizz): the agents panel, the pixel crabs and their costumes (`hooks/crab.ts`).
- **[filetree](https://github.com/data-goblin/claude-code-filetree)** by [Kurt Buhler](https://github.com/data-goblin): following file activity, and the parsing of shell commands (`hooks/files.ts`).

Both are MIT licensed; see [NOTICE](../../NOTICE). agent-crew itself is licensed under [PolyForm Noncommercial 1.0.0](../../LICENSE.md).
