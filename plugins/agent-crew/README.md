# agent-crew

A Claude Code mod: one pane (`/crew`) for the session's crew and what it touched, in three framed sections.

## Usage

The session's context fill and the plan's 5-hour and weekly limits, with their reset times and a `/compact` button. Warnings when a limit passes 80 % and 95 %, and when the context passes 85 % (`limitWarnings`).

## Subagents

Drawn the way the savvy-progress agents panel is (pixel crabs, context bar, cost, time), but for every subagent: Agent-tool subagents of any type, forks, teammates, background agents, workflow agents, nested subagents (indented under their parent), and loops only `$.agent.list()` knows.

- Two tabs, **Active** and **Finished**. A finished parent whose child still runs stays in Active as context.
- Each row shows what the agent did last. **Details** opens its task, its last ten actions, the files it read and changed, its final answer with a copy button, and **Highlight its files**, which dims every other file in the tree.
- A **timeline** under the list shows when each agent ran on one time axis (`showTimeline`).
- A notice when an agent ends (`notifyAgents`: `off`, `failures`, `background` (default), `all`).
- **Clear finished** takes finished runs off the list; their cost and tokens stay in the totals.

## Files

In the spirit of [filetree](https://github.com/data-goblin/claude-code-filetree): every file the main chat or a subagent read (purple), changed (orange, with `+N −N` from git) or that went into a commit during the session (green, with the short sha), plus files git reports as changed, as a folder tree. Coloured dots name the agents that touched each file.

- Press a file to open its **history** (who read, changed or committed it, and when) and its **diff** against HEAD (an untracked file shows its text). The open diff follows later edits.
- Two agents changing one file within ten minutes is a **conflict**: a ⚠ in the tree and a notice (`warnConflicts`).
- **Changes only** hides files that were only read.

Reads come from `Read`, `Grep` results and shell readers (`cat`, `head`, `sed`, `rg -l`, `Get-Content`, …); writes from `Edit`, `Write` and `NotebookEdit`. Git is read after writes and commands that may change the tree, and every ten seconds while the pane is open.

## Options

Set them in `/config`, or under `pluginConfigs.agent-crew.options` in `~/.claude/settings.json`.

| Option | Default | |
| --- | --- | --- |
| `language` | `auto` | `auto`, `de` or `en` |
| `autoOpen` | `true` | open the pane on the first subagent of a session |
| `showUsage` | `true` | the usage section |
| `showTimeline` | `true` | the timeline under the subagents |
| `showTotals` | `false` | cost, tokens and time of all subagents together |
| `notifyAgents` | `background` | `off`, `failures`, `background`, `all` |
| `limitWarnings` | `true` | warnings at 80 % / 95 % of a limit, 85 % context |
| `warnConflicts` | `true` | the notice on conflicting edits |
| `notifyVia` | `toast` | `toast`, or `system` for the terminal's or system's notification |

Cost is an estimate from token counts and the `PRICES` table in `hooks/register.tsx`, not a bill.

## Install

```
claude plugin marketplace add jduerrmann/claude-mods
claude plugin install agent-crew@claude-mods
```

## Credits

agent-crew grew out of two mods, and owes them a lot:

- **[savvy-progress](https://github.com/johnnyvizz/claude-kit/tree/main/plugins/savvy-progress)** by **[johnnyvizz](https://github.com/johnnyvizz)**: the agents panel, the pixel crabs and their costumes (`hooks/crab.ts`).
- **[filetree](https://github.com/data-goblin/claude-code-filetree)** by **[Kurt Buhler](https://github.com/data-goblin)**: the idea of watching file activity, and the shell-command reading (`hooks/files.ts`).

Both are MIT licensed; see [NOTICE](../../NOTICE). agent-crew itself is under [PolyForm Noncommercial 1.0.0](../../LICENSE.md): free to use, change and share, not for commercial purposes.
