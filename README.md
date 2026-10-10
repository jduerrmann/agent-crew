<h1 align="center">claude-mods</h1>

<p align="center">
  Mods for <a href="https://claude.com/claude-code">Claude Code</a>: see what your subagents are doing, what they touch, and how much room you have left.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-mod-D97757" alt="Claude Code mod">
  <img src="https://img.shields.io/badge/agent--crew-0.2.0-378ADD" alt="agent-crew 0.2.0">
  <img src="https://img.shields.io/badge/license-PolyForm_Noncommercial-22c55e" alt="PolyForm Noncommercial license">
</p>

<p align="center">
  <img src="media/panel.svg" alt="The agent-crew panel: usage rings, running and finished subagents with pixel crabs, and a file tree coloured by what was read, changed and committed" width="860">
</p>

---

> [!NOTE]
> **Standing on the shoulders of crabs.** agent-crew grew out of two mods I loved using, and it would not exist without them:
>
> - 🦀 **[savvy-progress](https://github.com/johnnyvizz/claude-kit/tree/main/plugins/savvy-progress)** by **[johnnyvizz](https://github.com/johnnyvizz)**: the agents panel, the pixel crabs and their costumes. agent-crew takes that panel from *savvy-flow's* workers to every subagent of a session.
> - 📁 **[filetree](https://github.com/data-goblin/claude-code-filetree)** by **[Kurt Buhler](https://github.com/data-goblin)**: the idea of watching Claude read, change and commit files, and how to read shell commands for it.
>
> Thank you both! If you like agent-crew, go star their repos too.

## agent-crew

One pane, `/crew`, for everything your session's crew is up to. Every subagent shows up, not just the ones a particular skill started:

<p align="center">
  <img src="media/crew.svg" alt="Pixel crabs in costumes: a pirate for Explore, a hard hat for Plan, an astronaut for claude-code-guide, a cap for general-purpose, a chef for workflow agents, a racer for teammates, a detective for savvy-heavy" width="860">
</p>

### 📊 Usage

- Context fill of the session, plus the 5-hour and weekly limits of your plan, each with its reset time.
- A `/compact` button right there.
- Warnings at 80 % and 95 % of a limit, and at 85 % context.

### 🦀 Subagents

- **Every agent:** any Agent-tool type, forks, teammates, background agents, workflow agents, and nested agents indented under their parent.
- **Tabs:** *Active* and *Finished*. A compact mode folds both into two rows of crabs.
- **Each row:** model, effort, context bar, tokens, estimated cost, run time, and the last thing the agent did.
- **▸ Details:** opens a card in the agent's colour with its task, last actions, files and final answer. *Copy answer* puts the answer on your clipboard.
- **Notices:** when background agents finish or fail.

### ⏱ Timeline

- When each agent ran, on one shared axis.
- Long pauses fold into a `+1:20:00` break, so rounds an hour apart both stay readable.

### 📁 Files

In the spirit of [filetree](https://github.com/data-goblin/claude-code-filetree), a tree of every file the main chat or a subagent touched:

- ◉ **read** (purple): from `Read`, `Grep` hits and shell readers like `cat`, `sed`, `rg -l` or `Get-Content`.
- ✎ **changed** (orange): with `+N −N` from git.
- ✓ **committed** (green): with the short sha.
- **Agent dots:** coloured dots show which agents touched each file. *Highlight its files* dims everything else.
- **▸ on a file:** opens its history (who read, changed or committed it, and when) and its diff against `HEAD`.
- **Conflict:** two agents changing one file within ten minutes get a blinking ⚠ and a notice.

## Install

```
/plugin marketplace add jduerrmann/claude-mods
/plugin install agent-crew@claude-mods
```

Or from a terminal:

```bash
claude plugin marketplace add jduerrmann/claude-mods
claude plugin install agent-crew@claude-mods
```

Then run `/crew`. The pane also opens on its own when the first subagent of a session starts.

## Options

Set them in `/config` under agent-crew, or in `~/.claude/settings.json`:

```json
{ "pluginConfigs": { "agent-crew": { "options": { "showTotals": true, "notifyAgents": "all" } } } }
```

| Option | Default | What it does |
| --- | --- | --- |
| `language` | `auto` | `auto`, `de` or `en`. `auto` follows Claude Code's language, then the system locale. |
| `autoOpen` | `true` | Open the pane when the first subagent of a session starts. |
| `showUsage` | `true` | The usage section. |
| `showTimeline` | `true` | The timeline. |
| `showTotals` | `false` | Cost, tokens and time of all subagents together. |
| `notifyAgents` | `background` | Notices when agents end: `off`, `failures`, `background` (background agents and any failure) or `all`. |
| `limitWarnings` | `true` | Warnings at 80 % / 95 % of a limit and 85 % context. |
| `warnConflicts` | `true` | The notice on conflicting edits. |
| `notifyVia` | `toast` | `toast`, or `system` for the terminal's or system's notification. |

## How it works

agent-crew is a Claude Code mod: a hooks module, no MCP server, no background process.

- **Agents:** `agent.spawn` records every start, including workflow agents and nested ones. `turn.step` adds context, tokens and cost per model request, `turn.complete` the final status. `$.agent.list()` fills in agents the mod never saw spawn.
- **Files:** `tool.call` records reads and writes, for the main loop and every subagent. Git status, line counts and new commits come from `git` itself, after writes and every ten seconds while the pane is open.
- **Usage:** `session.measure` brings context and rate-limit figures.
- **Drawing:** the desktop app gets SVG with CSS-only animation, which respects `prefers-reduced-motion`. The terminal gets the same content as text.

Cost is an estimate from token counts and a price table in `hooks/register.tsx`, not a bill.

## Develop

```bash
claude plugin validate plugins/agent-crew
claude plugin test plugins/agent-crew
```

## Credits

- **[johnnyvizz](https://github.com/johnnyvizz)**, for [savvy-progress](https://github.com/johnnyvizz/claude-kit/tree/main/plugins/savvy-progress) and [savvy-flow](https://github.com/johnnyvizz/claude-kit/tree/main/plugins/savvy-flow). The pixel crabs, their costumes and the agents panel in `hooks/crab.ts` follow their work.
- **[Kurt Buhler](https://github.com/data-goblin)**, for [filetree](https://github.com/data-goblin/claude-code-filetree). The file activity idea, and the shell-command reading in `hooks/files.ts`, follow it.

Both projects are MIT licensed. Their copyright notices are in [NOTICE](NOTICE), and the parts derived from them stay under MIT.

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md): free to download, use, change and share, as long as it is not for commercial purposes.

- ✅ **Allowed:** using it, forking it, building on it, sharing your changes, all for personal, hobby, research, education or non-profit use.
- ❌ **Not allowed:** selling it, charging for it, or using it to make money.

Want to use it commercially? Open an issue and ask.
