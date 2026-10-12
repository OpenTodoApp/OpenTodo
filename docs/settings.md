---
title: Settings
summary: A tour of Settings, what each section does, which choices belong to one device and which follow your account.
audience: user
section: Guides
specs: [web-app, settings-navigation]
screens: [settings/linked-accounts#account, settings/session#account, settings/users#administration, settings/sso#administration, settings/backups#data, settings/caldav#integrations, settings/webhooks#integrations, settings/email#capture, settings/assistants#ai, settings/tokens#integrations]
order: 140
card: settings
---
# Settings

Open **Settings** with the gear next to your name at the bottom of the sidebar, or press <kbd>g</kbd> then <kbd>s</kbd>. Settings opens on a short list of sections, each with a line saying what's inside. Pick one to open it.

<picture><source srcset="images/settings-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/settings-light.webp" alt="The Settings overview: your account line and the list of sections Account, General, Notifications, Data, Capture, Integrations, AI and Administration, each with a short description."></picture>

On a wide screen the list of sections stays on the left while you work in one, and the current section is highlighted. On a phone, each section starts with a **← Settings** link back to the list. Every section has its own address, such as `/settings/integrations`, so you can bookmark it or share a link with someone on the same server.

Some settings follow your account to every device. Others belong to the device you're on, so your phone and laptop can be set up differently. Settings that apply to one device say "this device" next to them.

Each panel has a **Help** link on the right that opens its part of this guide next to Settings.

What you see depends on your role: people who run the server see an extra **Administration** section and a few extra panels, and the public demo shows a note in place of most account and server settings.

## Account

Your name, email and role, and everything about signing in.

- **Password**: change your password. See [Account security](account-security.md#change-your-password).
- **Two-factor authentication**: a code from your phone on top of your password. See [Account security](account-security.md#turn-on-two-factor-authentication). The owner also sets the **policy** here: optional, required for the owner, or required for everyone.
- **Security**: passkeys. See [Account security](account-security.md#sign-in-with-a-passkey).
- **Recent activity**: sign-ins and token changes from the last 90 days. The owner also sees the server's **Audit log** here.
- **Linked accounts**: connect a single sign-on login, if your server offers one.
- **End-to-end encryption**: encrypt your task text on your devices. See [End-to-end encryption](e2ee.md).
- **Session**: **Sign out** of this device. This also removes your tasks from it; changes not yet sent are uploaded first.

## General

How the app behaves on this device.

- **Calendar**: when the Day and Week grid starts and ends, and how long your working day is. See [Time blocking](time-blocking.md#adjust-the-grid).
- **Start view**: the view this device opens on. See [Views](views.md#choose-where-the-app-opens).
- **Keyboard**: turn on Vim keybindings. See [Keyboard shortcuts](keyboard.md#vim-keybindings).
- **Quick add**: turn natural-language parsing on or off, pick the languages it understands, and the order of day and month in dates like `12/11`. See [Quick add syntax](quick-add.md#languages).
- **Voice capture**: dictate tasks into quick add. Off until you turn it on, and the app explains first what your browser does with the audio. See [Quick add syntax](quick-add.md#voice).
- **Projects**: archive projects automatically after 30 days without open tasks, and bring back archived projects with **Restore**. See [Trash and history](trash-and-history.md#archived-projects).

## Notifications

Push notifications for reminders on this device. See [Notifications](notifications.md).

## Data

- **Your data**: **Download export (JSON)** saves everything you have in one file. **Import data…** brings in tasks from a file. See [Import and export](import-export.md). The sync status of this device is shown underneath.
- **Backups**: scheduled backups to a folder, S3 or WebDAV (owner only). See [Backups](backups.md).

## Capture

- **Capture**: the **Add to OpenTodo** bookmarklet, to save the page you're reading as a task. See [Capturing pages](capture.md).
- **Email to task**: your own secret address; emails sent there become tasks. See [Email to task](email.md).

## Integrations

These panels connect OpenTodo to other tools. Some appear only when the person running your server has switched the feature on.

- **Calendar apps (CalDAV)**: see your tasks in calendar and reminder apps on your phone or computer, with an app password. See [Calendar apps](caldav.md).
- **Webhooks**: send a message to another service when tasks change. See [Webhooks](webhooks.md).
- **API tokens**: keys for scripts and the `ot` command-line client. A token is shown once, when you create it. Read-only tokens can't change anything; tokens for an AI assistant that can make changes work only through the assistant tools and never on the rest of the API. See [HTTP API](api.md) and [Command-line client](cli.md).

## AI

- **Assistant**: the in-app assistant, when the server owner has turned it on: your consent, which assistant you use (the server's, or your own Anthropic, OpenAI or Gemini provider, model and key, if allowed), this month's usage, **Apply small changes without review (this device)** and **Clear conversations on this device**. The owner also chooses the provider, models, keys, network and monthly allowance here. See [AI assistant](assistant.md).
- **AI assistants**: give an AI assistant read-only access to your tasks, or, when the server owner allows it and you switch on **Allow AI assistants to make changes**, a token for an assistant that can make changes you can undo. See [AI assistants (MCP)](mcp.md). A token you create here is also listed under **Integrations → API tokens**.

## Administration

Only the owner and admins of the server see this section.

- **Users**: everyone with an account, their role and last sign-in. Make someone an admin (owner only), deactivate or reactivate an account, create a password reset link, or delete an account.
- **Members**: invite people with a single-use link. See [Sharing and comments](sharing.md#invite-someone-new).
- **Project invite links**: **Members can invite new people with project links** (owner only, off by default) lets links that members create in a project's Share dialog also create accounts. See [Who can bring new people](sharing.md#who-can-bring-new-people).
- **Single sign-on**: sign-in through your company or family identity provider (owner only). See [Single sign-on](self-hosting/sso.md).

Running the server itself is covered in [Running with Docker](self-hosting/docker.md).
