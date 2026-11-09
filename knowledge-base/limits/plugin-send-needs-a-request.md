---
type: limit
area: host-api
status: active
verified: 2026-11-09
claude-code:
updated: 2026-11-09
---

# A mod can't message or resume a subagent in auto mode

**Why:**
- `$.session.send({ to: { agentId }, text })` is the SendMessage tool's own delivery. By the host's types it reaches a running agent's inbox, and resumes a finished one from its transcript.
- In auto mode, every SendMessage passes the server-side auto-mode classifier. It judges an action against the request in the conversation that produced it. A press in the pane is no such request, so the classifier gave no verdict, and nothing was delivered. The host's reason began: "The server-side auto mode classifier gave no verdict for SendMessage: the request that produced this action did not ask for one. Issue the action again once, as-is; …" (2026-11-09, user's screenshot).
- `TaskStop` from the mod is not held up this way: ■ stops a background agent ([stopping-subagents](stopping-subagents.md)).

**Workaround:** none in the mod. A ✉ Message / ↻ Resume pair in an agent's details was built and taken out again before a commit. The only way through would have been to put the message into the prompt for the person to send, which costs a main-chat turn, and the user didn't want that detour. A message to a subagent goes through the main chat ("send X to the agent …").

**Not checked:** whether the one retry the reason asks for ever succeeds; whether other permission modes let a mod's send through, or ask in a dialog.

**Re-check when:** the auto-mode classifier accepts a plugin's own action (the person's press) as its request, or the host gives mods an agent message call outside SendMessage.
