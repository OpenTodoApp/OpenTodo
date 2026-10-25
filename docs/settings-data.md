---
title: "Settings: Data"
summary: The Integrations and Data sections of Settings, CalDAV, calendar feeds, webhooks, API tokens, the assistant and MCP, export, import, attachments and archived projects.
audience: user
section: Guides
specs: []
screens: [settings/integrations#integrations, settings/caldav#integrations, settings/webhooks#integrations, settings/tokens#integrations, settings/ai#integrations, settings/assistants#integrations]
order: 143
---

# Settings: Data

<picture><source srcset="images/import-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/import-light.webp" alt="Settings, the import page: a file picker for an export from OpenTodo or another app, and the list of supported formats."></picture>

The **Data** group of [Settings](settings.md) connects OpenTodo to other tools and manages your data.

## Integrations

One page per tool, each row with its state (**Webhooks · 2**). Some work only when the person running your server has switched the feature on.

- **Calendar apps (CalDAV)**: see your tasks in calendar and reminder apps such as Apple Reminders, Thunderbird or Nextcloud Tasks, with an app password. Each project is a list, and the Inbox is its own list. On a plain `http://` address app passwords would travel unencrypted, so use HTTPS outside your home network. See [Calendar apps](caldav.md).
- **Calendar feeds**: show your Google, Outlook or Apple calendars in Day and Week, and get a private address that lets calendar apps show your tasks. The server owner turns it on here. See [Calendar feeds](calendar-feeds.md).
- **Issues**: open GitHub or GitLab issues assigned to you become tasks that complete when the issue closes. The server owner turns it on here. See [Issue import](issue-import.md).
- **Webhooks**: send a message to another service, such as Home Assistant or n8n, when tasks and projects change; each request is signed with the webhook's secret. The owner's **Allow private network targets** lets receivers on your LAN or the server itself be reached, for everyone; leave it off on a public server. See [Webhooks](webhooks.md).
- **API tokens**: keys for scripts and the `ot` command-line client. A token is shown once, when you create it. Read-only tokens can't change anything; tokens for an AI assistant that can make changes work only through the assistant tools and never on the rest of the API. See [HTTP API](api.md) and [Command-line client](cli.md).
- **Assistant**: the in-app assistant, when the server owner has turned it on: your consent, which assistant you use (the server's, or your own Anthropic, OpenAI or Gemini provider, model and key, if allowed), this month's usage, **Small changes without review** (this device; creating, moving, deleting or editing text always asks you) and **Clear conversations on this device**. The owner also chooses the provider, models, keys, network and monthly allowance here. See [AI assistant](assistant.md) and [Assistant settings](assistant-settings.md).
- **AI assistants**: give an AI assistant read-only access to your tasks, or, when the server owner allows it and you switch on **Changes to my tasks**, a token for an assistant that can make changes you can undo. Such an assistant can create, edit, complete, reschedule and move tasks, create projects and labels and comment; it never deletes anything permanently or changes sharing, members, tokens or settings, and moves to the Trash only tasks it created. Turning the switch off stops all your assistants at once, without revoking their tokens. The owner turns the endpoint on with **Allow AI assistants** and changes with **Assistants may make changes**; each account sees only its own data, and the server itself contacts no one. See [AI assistants (MCP)](mcp.md). A token you create here is also listed under **API tokens**.

## Data

**Download export (JSON)** saves everything you can see in one file, the Trash included, as a personal copy or to move to another server; and **Download export with files (ZIP)** adds your attached files. **Import data** brings in tasks from a file. See [Import and export](import-export.md). **Attachments** shows how much of your total your files use and how large one file may be (see [Attachments](attachments.md)). The sync status of this device is shown too.

**Projects**: archive projects automatically after 30 days without open tasks. **Show archived projects** opens the Projects page at its archived projects, where **Restore** brings one back. See [Archived projects](archived-projects.md#bring-back-an-archived-project).
