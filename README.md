<h1 align="center">agent-crew</h1>

<p align="center">
  A <a href="https://claude.com/claude-code">Claude Code</a> mod: see what your subagents are doing, what they touch, what it costs, and how much room you have left.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-mod-D97757" alt="Claude Code mod">
  <img src="https://img.shields.io/badge/agent--crew-0.3.0-378ADD" alt="agent-crew 0.3.0">
  <img src="https://img.shields.io/badge/license-PolyForm_Noncommercial-22c55e" alt="PolyForm Noncommercial license">
</p>

<p align="center">
  <img src="media/panel.svg" alt="The whole agent-crew panel at a glance: usage rings, the cost of main chat and subagents, running and finished subagents with pixel crabs, a timeline with a folded pause, and a file tree coloured by what was read, changed and committed" width="860">
</p>

---

> [!NOTE]
> **Standing on the shoulders of crabs.** agent-crew grew out of two mods I loved using, and it would not exist without them:
>
> - 🦀 **[savvy-progress](https://github.com/johnnyvizz/claude-kit/tree/main/plugins/savvy-progress)** by **[johnnyvizz](https://github.com/johnnyvizz)**: the agents panel, the pixel crabs and their costumes. agent-crew takes that panel from *savvy-flow's* workers to every subagent of a session.
> - 📁 **[filetree](https://github.com/data-goblin/claude-code-filetree)** by **[Kurt Buhler](https://github.com/data-goblin)**: the idea of watching Claude read, change and commit files, and how to read shell commands for it.
>
> Thank you both! If you like agent-crew, go star their repos too.

## What it shows

One pane, `/crew`, for everything your session's crew is up to. Every subagent shows up, not just the ones a particular skill started, each as a pixel crab in the costume of its type:

<p align="center">
  <img src="media/crew.svg" alt="Pixel crabs in costumes: a pirate for Explore, a hard hat for Plan, an astronaut for claude-code-guide, a cap for general-purpose, a chef for workflow agents, a racer for teammates, a detective for savvy-heavy" width="860">
</p>

The pane is made of framed sections, top to bottom:

| Section | What it shows | Shown |
| --- | --- | --- |
| [📊 Usage](#-usage) | Context fill, 5-hour and weekly limit | by default |
| [💰 Cost](#-cost) | Main chat and subagents apart, with a total | when turned on |
| [🦀 Subagents](#-subagents) | Every agent in *Active* / *Finished* tabs, with details | always |
| [⏱ Timeline](#-timeline) | When each agent ran | by default |
| [📁 Files](#-files) | What was read, changed and committed, with diffs | always |

Everything can be switched in [⚙ Settings](#-settings).

### 📊 Usage

<p align="center">
  <img src="media/usage.svg" alt="Usage section: rings for 51 % context, 83 % of the 5-hour limit in amber, 10 % of the week, each with its reset time, and a warning notice for the 5-hour limit" width="860">
</p>

- **Context:** how full the session's context window is, in percent and tokens.
- **5h and week:** your plan's two limits, each with the time until it resets.
- **Colours:** rings turn amber from 80 % and red from 95 %.
- **Warnings:** a notice once a limit passes 80 % and again at 95 %, and when the context passes 85 %.
- **`/compact`:** a button to compact the conversation right there.

### 💰 Cost

<p align="center">
  <img src="media/cost.svg" alt="Cost section: main chat 48k new and 2.1M cached tokens for about $2.31, six subagents 95k new and 2.9M cached for about $4.18, a bar splitting the total, and the total of about $6.49" width="860">
</p>

- **Main chat and subagents apart:** each with its estimated cost, and a bar for the share of each.
- **New and cached tokens apart:** every request rereads the whole context, mostly from the cache. *New* counts input, output and cache writes; *cached* is the cheap rereading. That keeps a long agent from looking like millions of tokens.
- **Total** of both, including agents you cleared from the list.
- Off by default, turn it on with *Cost* in the settings. Cost is an estimate from token counts and a price table, not a bill.

### 🦀 Subagents

<p align="center">
  <img src="media/agents.svg" alt="Subagents section: Active and Finished tabs, a running Explore agent, an expanded general-purpose agent in a blue card with its task and recent actions, a finished Plan agent nested under it, and a Clear finished button" width="860">
</p>

- **Every agent:** any Agent-tool type, forks, teammates, background agents, workflow agents, and agents nested under their parent.
- **Tabs:** *Active* and *Finished*. A finished parent whose child still runs stays in *Active*, for context.
- **Each row:** model, effort, the last thing the agent did, context fill, estimated cost and run time. Crabs walk while their agent works.
- **▸ opens a card** in the agent's colour with:
  - its task
  - its last actions, tool calls and what it wrote between them
  - the files it read and changed, with *Highlight its files* for the file tree
  - its final answer, with *Copy answer*
- **Notices** when background agents finish, and whenever one fails.
- **✕ Clear finished** takes finished agents off the list; their cost stays in the totals.

#### Compact mode

<p align="center">
  <img src="media/compact.svg" alt="Compact mode: a row of two walking crabs for the active agents, and a row of five dimmed crabs with check and cross badges for the finished ones" width="860">
</p>

**⤡ Compact** folds the section into two rows: the active agents walking, and the finished ones with a ✓, ✗ or ■ badge for done, failed or stopped. The other sections stay as they are.

### ⏱ Timeline

<p align="center">
  <img src="media/timeline.svg" alt="Timeline: six agents as bars on one axis, two rounds of work with a folded pause of 1 hour 20 minutes between them" width="860">
</p>

- **One axis** for all agents: who ran when, and what ran side by side.
- **Folded pauses:** a stretch longer than 90 seconds with no agent running folds into a break with its length, so two rounds an hour apart both keep real bars.
- Running agents pulse.

### 📁 Files

<p align="center">
  <img src="media/files.svg" alt="Files section: a folder tree with tokens.ts open in a red card for a conflict, its history of who read and changed it, and its diff; session.ts read, index.ts committed, MIGRATION.md new" width="860">
</p>

In the spirit of [filetree](https://github.com/data-goblin/claude-code-filetree), a tree of every file the main chat or a subagent touched, plus the files git reports as changed:

- ◉ **read** (purple): from `Read`, `Grep` hits and shell readers like `cat`, `sed`, `rg -l` or `Get-Content`.
- ✎ **changed** (orange): with `+N −N` from git, `new` for files git does not track yet.
- ✓ **committed** (green): with the short sha of the commit.
- **Shimmer:** a file just read, changed or committed shimmers in that colour for a few seconds, a bright band sweeping across its name, as in filetree.
- **Search:** the `/` line narrows the tree to the paths that hold what you type; Enter opens the first hit.
- **Agent dots:** coloured dots show which agents touched a file.
- **▸ opens a card** in the file's colour with its history (who read, changed or committed it, and when) and its diff against `HEAD`. A new file shows its text.
- **Conflict:** two agents changing one file within ten minutes get a blinking ⚠, a red card and a notice.
- **Changes only** hides the files that were only read. The header shows the branch, and ↑↓ against its upstream.

### ⚙ Settings

<p align="center">
  <img src="media/settings.svg" alt="Settings tab: Display group with switches for Usage and Timeline and a choice of language, Notifications group with a choice of when agents notify and a switch for the conflict warning" width="860">
</p>

`/crew-settings`, or **⚙ Settings** at the top of the pane, opens a settings tab. It has switches and choices in two groups, *Display* and *Notifications*. Every change applies at once, and the tab writes the same values as `/config`.

## Install

```
/plugin marketplace add jduerrmann/agent-crew
/plugin install agent-crew@agent-crew
```

Or from a terminal:

```bash
claude plugin marketplace add jduerrmann/agent-crew
claude plugin install agent-crew@agent-crew
```

Then run `/crew`. The pane also opens on its own when the first subagent of a session starts.

## Options

Change them in the [settings tab](#-settings), in `/config`, or in `~/.claude/settings.json`:

```json
{ "pluginConfigs": { "agent-crew": { "options": { "showTotals": true, "notifyAgents": "all" } } } }
```

| Option | Default | What it does |
| --- | --- | --- |
| `language` | `auto` | `auto`, `de` or `en`. `auto` follows Claude Code's language, then the system locale. |
| `autoOpen` | `true` | Open the pane when the first subagent of a session starts. |
| `showUsage` | `true` | The usage section. |
| `showTimeline` | `true` | The timeline. |
| `showTotals` | `false` | A cost section: the main chat and the subagents apart, new and cached tokens, and the total. |
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
- **[Kurt Buhler](https://github.com/data-goblin)**, for [filetree](https://github.com/data-goblin/claude-code-filetree). The file activity idea, the shimmer, the search line, and the shell-command reading in `hooks/files.ts`, follow it.

Both projects are MIT licensed. Their copyright notices are in [NOTICE](NOTICE), and the parts derived from them stay under MIT.

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md): free to download, use, change and share, as long as it is not for commercial purposes.

- ✅ **Allowed:** using it, forking it, building on it, sharing your changes, all for personal, hobby, research, education or non-profit use.
- ❌ **Not allowed:** selling it, charging for it, or using it to make money.

Want to use it commercially? Open an issue and ask.
