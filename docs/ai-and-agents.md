---
title: Use AI with OpenTodo
summary: Three ways to bring an AI assistant to your tasks: the assistant in the app, an assistant you already use over MCP, or a coding agent with the ot command. Which to pick and what each can touch.
audience: user
section: Guides
specs: [in-app-assistant, mcp-server, cli-client]
screens: []
order: 74
---
# Use AI with OpenTodo

<picture><source srcset="images/assistant-chat-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/assistant-chat-light.webp" alt="The in-app assistant panel on the right of the Inbox, answering What is due today? with a list of tasks."></picture>

OpenTodo doesn't come with an AI of its own and never sends your tasks anywhere by itself. You bring the model, and you decide what it can see and change. There are three ways to do it, and you can use any mix of them.

| | In the app | Your assistant (MCP) | A coding agent (`ot`) |
| --- | --- | --- | --- |
| **Where you talk to it** | A chat panel in OpenTodo (<kbd>Shift</kbd>+<kbd>I</kbd>) | Claude Desktop, an IDE or any MCP client | A terminal agent or an automation script |
| **Which model** | Anthropic, OpenAI, Gemini or a model on your own network, chosen by the server owner | Whatever your assistant uses | Whatever your agent uses |
| **Who pays** | The key the owner (or you, if allowed) enters in Settings | Your assistant's own plan | Your agent's own plan |
| **Changes** | Proposed, you review and apply them, one step undoes them | Off by default; with an `agent` token, applied directly and undoable from history | Same as MCP, plus `--dry-run` to preview |
| **Set up by** | The server owner turns it on once | You create a token and add one entry to your assistant's config | You create a token and run `ot auth set-token` |
| **Guide** | [AI assistant](assistant.md) | [AI assistants (MCP)](mcp.md) | [Using ot from an agent](cli.md#using-ot-from-an-agent) |

## Which one to pick

- **You want to ask and plan from inside OpenTodo**, on your phone too, and see every change before it happens: use the [assistant in the app](assistant.md).
- **You already talk to an assistant all day** and want it to know your tasks ("what's on my plate today?", "add these three steps to the Garden project"): connect it over [MCP](mcp.md).
- **You work with a coding agent in a terminal**, or want a script or cron job that an agent can drive safely: give it the [`ot` command and its skill file](cli.md#using-ot-from-an-agent).

## What every option has in common

Every option is off until someone says yes, can reach only tasks (with their [custom field](custom-fields.md) values and [tracked time](time-tracking.md), which an assistant can read but never start, stop or change), projects, labels and comments, records every change in history where you can undo it, has limits on how much it may change, treats text in tasks as data rather than instructions, and respects end-to-end encryption. The details are in [What AI assistants can and can't do](ai-limits.md).

## Privacy

No option sends anything unless it's turned on. When it is, only the assistant you chose receives your task content, and only while you're using it. OpenTodo itself has no telemetry. Conversations with the assistant in the app are kept on your device, not on the server.
