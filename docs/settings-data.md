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

These cards connect OpenTodo to other tools. Some appear only when the person running your server has switched the feature on.

- **Calendar apps (CalDAV)**: see your tasks in calendar and reminder apps on your phone or computer, with an app password. See [Calendar apps](caldav.md).
- **Calendar feeds**: show your Google, Outlook or Apple calendars in Day and Week, and get a private address that lets calendar apps show your tasks. The server owner turns it on here. See [Calendar feeds](calendar-feeds.md).
- **Webhooks**: send a message to another service when tasks change. See [Webhooks](webhooks.md).
- **API tokens**: keys for scripts and the `ot` command-line client. A token is shown once, when you create it. Read-only tokens can't change anything; tokens for an AI assistant that can make changes work only through the assistant tools and never on the rest of the API. See [HTTP API](api.md) and [Command-line client](cli.md).
- **Assistant**: the in-app assistant, when the server owner has turned it on: your consent, which assistant you use (the server's, or your own Anthropic, OpenAI or Gemini provider, model and key, if allowed), this month's usage, **Apply small changes without review (this device)** and **Clear conversations on this device**. The owner also chooses the provider, models, keys, network and monthly allowance here. See [AI assistant](assistant.md) and [Assistant settings](assistant-settings.md).
- **AI assistants**: give an AI assistant read-only access to your tasks, or, when the server owner allows it and you switch on **Allow AI assistants to make changes**, a token for an assistant that can make changes you can undo. See [AI assistants (MCP)](mcp.md). A token you create here is also listed under **API tokens**.

## Data

**Download export (JSON)** saves everything you have in one file, and **Download export with files (ZIP)** adds your attached files. **Import data…** brings in tasks from a file. See [Import and export](import-export.md). **Attachments** shows how much of your total your files use and how large one file may be (see [Attachments](attachments.md)). The sync status of this device is shown too.

**Projects**: archive projects automatically after 30 days without open tasks, and bring back archived projects with **Restore**. See [Trash and history](trash-and-history.md#archived-projects).
