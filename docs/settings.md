---
title: Settings
summary: A tour of Settings, what each section does, which choices belong to one device and which follow your account.
audience: user
section: Guides
specs: [web-app]
screens: [settings/linked-accounts#your-account, settings/session#your-account, settings/users#for-server-admins, settings/sso#for-server-admins, settings/backups#for-server-admins, settings/caldav#connect-other-apps, settings/webhooks#connect-other-apps, settings/email#connect-other-apps, settings/assistants#connect-other-apps, settings/tokens#connect-other-apps]
order: 140
card: settings
---
# Settings

Open **Settings** with the gear next to your name at the bottom of the sidebar, or press <kbd>g</kbd> then <kbd>s</kbd>. It's one long page. This guide walks through it from top to bottom.

<picture><source srcset="images/settings-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/settings-light.webp" alt="The top of the Settings page with the sections Your data, Calendar and Password."></picture>

Some settings follow your account to every device. Others belong to the device you're on, so your phone and laptop can be set up differently. Settings that apply to one device say "this device" next to them.

Each section has a **Help** link on the right that opens its part of this guide next to Settings.

What you see depends on your role: people who run the server see extra sections, and the public demo hides most account and server settings.

## Your data

**Download export (JSON)** saves everything you have in one file. **Import data…** brings in tasks from a file. See [Import and export](import-export.md).

## Calendar

When the Day and Week grid starts and ends, and how long your working day is. Each device keeps its own. See [Time blocking](time-blocking.md#adjust-the-grid).

## Your account

- **Password**: change your password. See [Account security](account-security.md#change-your-password).
- **Two-factor authentication**: a code from your phone on top of your password. See [Account security](account-security.md#turn-on-two-factor-authentication).
- **End-to-end encryption**: encrypt your task text on your devices. See [End-to-end encryption](e2ee.md).
- **Notifications**: push notifications for reminders on this device. See [Notifications](notifications.md).
- **Security**: passkeys. See [Account security](account-security.md#sign-in-with-a-passkey).
- **Linked accounts**: connect a single sign-on login, if your server offers one.
- **Recent activity**: sign-ins and token changes from the last 90 days.
- **Session**: **Sign out** of this device. This also removes your tasks from it; changes not yet sent are uploaded first.

## How the app behaves on this device

- **Start view**: the view this device opens on. See [Views](views.md#choose-where-the-app-opens).
- **Keyboard**: turn on Vim keybindings. See [Keyboard shortcuts](keyboard.md#vim-keybindings).
- **Projects**: archive projects automatically after 30 days without open tasks, and bring back archived projects with **Restore**. See [Trash and history](trash-and-history.md#archived-projects).
- **Quick add**: turn natural-language parsing on or off, pick the languages it understands, and the order of day and month in dates like `12/11`. See [Quick add syntax](quick-add.md#languages).
- **Voice capture**: dictate tasks into quick add. Off until you turn it on, and the app explains first what your browser does with the audio. See [Quick add syntax](quick-add.md#voice).
- **Capture**: the **Add to OpenTodo** bookmarklet, to save the page you're reading as a task. See [Capturing pages](capture.md).

## Connect other apps

These sections connect OpenTodo to other tools. Some appear only when the person running your server has switched the feature on.

- **Calendar apps (CalDAV)**: see your tasks in calendar and reminder apps on your phone or computer, with an app password. See [Calendar apps](caldav.md).
- **Webhooks**: send a message to another service when tasks change. See [Webhooks](webhooks.md).
- **Email to task**: your own secret address; emails sent there become tasks. See [Email to task](email.md).
- **Assistant**: the in-app assistant, when the server owner has turned it on: your consent, your own key (if allowed), this month's usage, **Apply small changes without review (this device)** and **Clear conversations on this device**. The owner also chooses the provider, models, keys, network and monthly allowance here. See [AI assistant](assistant.md).
- **AI assistants**: give an AI assistant read-only access to your tasks, or, when the server owner allows it and you switch on **Allow AI assistants to make changes**, a token for an assistant that can make changes you can undo. See [AI assistants (MCP)](mcp.md).
- **API tokens**: keys for scripts and the `ot` command-line client. A token is shown once, when you create it. Read-only tokens can't change anything; tokens for an AI assistant that can make changes work only through the assistant tools and never on the rest of the API. See [HTTP API](api.md) and [Command-line client](cli.md).

## For server admins

If you're the owner or an admin of the server, you also see:

- **Members**: invite people with a single-use link. See [Sharing and comments](sharing.md#invite-someone-new).
- **Users**: everyone with an account, their role and last sign-in. Make someone an admin (owner only), deactivate or reactivate an account, create a password reset link, or delete an account.
- **Single sign-on**: sign-in through your company or family identity provider (owner only). See [Single sign-on](self-hosting/sso.md).
- **Backups**: scheduled backups to a folder, S3 or WebDAV (owner only). See [Backups](backups.md).
- The **policy** under Two-factor authentication: make it optional, required for the owner, or required for everyone (owner only).

Running the server itself is covered in [Running with Docker](self-hosting/docker.md).
