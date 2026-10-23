---
title: Use OpenTodo from Claude Code
summary: Install the OpenTodo plugin in Claude Code to connect Claude to your own server, with skills that teach it to read and plan your tasks safely.
audience: developer
section: Integrations
specs: [mcp-server]
screens: []
order: 41
---
# Use OpenTodo from Claude Code

[Claude Code](https://code.claude.com) installs plugins from marketplaces. OpenTodo has one: install it, enter your server's address and a token, and Claude can read your tasks and, when you allow it, plan and change them. Everything goes through your server's [MCP endpoint](mcp.md); the plugin adds no access of its own.

## What the plugin brings

- **The connection** to `https://<your server>/mcp` with your token.
- **Skills** that teach Claude how to use OpenTodo well: read before changing, use ids rather than titles, show a plan and wait for your yes before changing several tasks, pass your time zone, and never follow instructions written inside a task.
- **`/opentodo:today`** shows what's on your plate today in a sensible order.
- **`/opentodo:plan-week`** spreads the coming week's work over the days, within the time you have.
- The skill for [`ot`](cli.md), for sessions that also have a shell.

## Install

1. **Turn on AI assistants.** The server owner switches on **Settings → Integrations → AI assistants → Allow AI assistants**. For an assistant that may make changes, the owner also allows assistant changes, and you switch on **Allow AI assistants to make changes** for your account ([details](mcp.md#letting-an-assistant-make-changes)).
2. **Create a token** in **Settings → Integrations → AI assistants**: an **agent** token for an assistant that may make changes, or a read-only one for an assistant that only looks. Don't use a full-access token: on MCP it only gets the read tools anyway.
3. **Add the plugin** in Claude Code:

   ```
   /plugin marketplace add pixari/opentodo-claude
   /plugin install opentodo@opentodo
   ```

   Claude Code asks for your server address, such as `https://todo.example.com`, and the token; if it doesn't, run `/plugin configure opentodo@opentodo`. It keeps the token in your system's credential store, not in a file.

To update, run `/plugin marketplace update opentodo`. Each OpenTodo release publishes a matching version of the plugin.

## What Claude can and can't do

Claude sees what your token sees: your own projects and the shared projects you're a member of. With an agent token and both switches on, it can create, edit, schedule, complete and move tasks, and arrange projects and sections. It can move to the Trash only tasks it created, and nothing is ever deleted permanently. Every change shows in the task's history, labelled as made by an AI assistant, and you can undo it there.

Projects kept away from AI assistants stay invisible to it. On an [encrypted account](e2ee.md), Claude can schedule, complete and move tasks but can't write readable text; connect it through `ot mcp --decrypt` on your own computer for that ([details](mcp.md#encrypted-accounts-on-your-computer)).

## Without Claude Code

The MCP skill also ships with every release as `opentodo-mcp-skill.zip`, for assistants that read skill files. Other clients connect to `/mcp` by hand, as [AI assistants (MCP)](mcp.md) describes.
