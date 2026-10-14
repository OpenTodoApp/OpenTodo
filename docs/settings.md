---
title: Settings
summary: A tour of Settings, what each section does, which choices belong to one device and which follow your account.
audience: user
section: Guides
specs: [web-app, settings-navigation, date-time-preferences]
screens: [settings/appearance#appearance, settings/date-time#date-and-time, settings/linked-accounts#security, settings/session#account, settings/users#administration, settings/sso#access-policies, settings/backups#backups, settings/caldav#integrations, settings/webhooks#integrations, settings/email#capture, settings/assistants#ai, settings/tokens#integrations]
order: 140
card: settings
---
# Settings

Open **Settings** with the gear next to your name at the bottom of the sidebar, or press <kbd>g</kbd> then <kbd>s</kbd>. Settings opens on your profile card (your initials, name, email and role) and the sections, grouped under **You**, **App**, **Data and connections** and, for the people who run the server, **Server**. Each section has an icon and a line saying what's inside. Pick one to open it.

<picture><source srcset="images/settings-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/settings-light.webp" alt="The Settings overview: the profile card, then the sections grouped under You, App and Data and connections, each with an icon and a short description."></picture>

On a wide screen the grouped list of sections stays on the left while you work in one, and the current section is highlighted. On a phone, each section starts with a **← Settings** link back to the list. Every section has its own address, such as `/settings/integrations`, so you can bookmark it or share a link with someone on the same server. Older links keep working: `/settings/general` opens **Preferences**.

Inside a section, each panel is a card. It leads with its current state (for example whether two-factor authentication is on and how many recovery codes are left), then its settings as rows with the control on the right. Forms with several fields open from a button, and actions that remove something ask you to confirm first and say what will be lost.

Some settings follow your account to every device. Others belong to the device you're on, so your phone and laptop can be set up differently. Settings that apply to one device say "this device" next to them.

Each panel has a **Help** link on the right that opens its part of this guide next to Settings.

What you see depends on your role: the owner and admins also see the **Server** group, and the public demo shows a note in place of most account and server settings.

## You

### Account

Your profile card and **Sign out of this device**. Signing out removes your tasks from this device; changes not yet sent are uploaded first, and the app asks you to confirm.

### Security

- **Password**: **Change password** opens the form. See [Account security](account-security.md#change-your-password).
- **Two-factor authentication**: a code from your phone on top of your password. The card shows whether it's on and how many recovery codes are left, and warns when only a few remain. See [Account security](account-security.md#turn-on-two-factor-authentication).
- **Passkeys**: sign in with your fingerprint, face or device PIN. See [Account security](account-security.md#sign-in-with-a-passkey).
- **Linked accounts**: connect a single sign-on login, if your server offers one.

### Encryption

Encrypt your task text on your devices, and keep its recovery key. See [End-to-end encryption](e2ee.md).

### Activity

Sign-ins and token changes from the last 90 days. The owner also sees the server's **Audit log** here.

## App

### Preferences

How the app behaves on this device.

- **Appearance**: light or dark, and a colour theme, on all your devices (see below).
- **Start view**: the view this device opens on. See [Views](views.md#choose-where-the-app-opens).
- **Date and time**: how dates and times look and where weeks start, on all your devices (see below).
- **Calendar**: when the Day and Week grid starts and ends, and how long your working day is. See [Time blocking](time-blocking.md#adjust-the-grid).
- **Keyboard**: turn on Vim keybindings. See [Keyboard shortcuts](keyboard.md#vim-keybindings).

#### Appearance

- **Mode**: **System** follows your device's light or dark setting (the default), **Light** and **Dark** keep the app that way whatever the device says.
- **Theme**: the colour of buttons, links, the focus ring and selected items: **Emerald** (the default), **Blue**, **Indigo**, **Violet**, **Rose**, **Orange**, **Teal** or **Graphite**. Each tile previews its theme; with the keyboard, the arrow keys move between them.

Both apply at once, without a reload, and follow your account to every device, also when you change them offline. They never change other people's app. Priority colours (P1 to P4), warnings and errors, and the colours of your projects, labels and views keep their meaning in every theme. The installed app's title bar follows the theme too; the splash screen when it starts stays neutral, because it is the same for everyone on the server. Every theme meets the same contrast rules in light and dark.

#### Date and time

Three choices that follow your account to every device, also when you change them offline:

- **Date format**: **System** (the way this browser writes dates), **Day-month** (`14 Oct`, `14/10/2026`), **Month-day** (`Oct 14`, `10/14/2026`) or **ISO** (`2026-10-14`). Each option shows today's date in that format. Month and weekday names stay in your browser's language.
- **Time format**: **System**, **12-hour** (`3:00 PM`) or **24-hour** (`15:00`).
- **First day of the week**: **System**, **Monday**, **Sunday** or **Saturday**. It decides where the Week view and the calendar of a date field start.

The **Preview** shows a due date, a date, a due time, a comment time and this week as they will appear. A change applies at once everywhere in the app, without a reload: task rows, the task detail, reminders, the Day and Week views, comments, history and the lists in Settings. With a numeric date order on **Automatic**, quick add reads dates like `3/11` in your date format too.

### Notifications

Push notifications for reminders on this device, and a test that shows whether they arrive. See [Notifications](notifications.md).

### Capture

- **Quick add**: turn natural-language parsing on or off, pick the languages it understands, and the order of day and month in dates like `12/11`. See [Quick add syntax](quick-add.md#languages).
- **Voice capture**: dictate tasks into quick add. Off until you turn it on, and the app explains first what your browser does with the audio. See [Quick add syntax](quick-add.md#voice).
- **Bookmarklet and extension**: the **Add to OpenTodo** bookmarklet, to save the page you're reading as a task. See [Capturing pages](capture.md).
- **Email to task**: your own secret address; emails sent there become tasks. See [Email to task](email.md).

### Projects

Archive projects automatically after 30 days without open tasks, and bring back archived projects with **Restore**. See [Trash and history](trash-and-history.md#archived-projects).

## Data and connections

### Data

**Download export (JSON)** saves everything you have in one file. **Import data…** brings in tasks from a file. See [Import and export](import-export.md). The sync status of this device is shown too.

### Integrations

These panels connect OpenTodo to other tools. Some appear only when the person running your server has switched the feature on.

- **Calendar apps (CalDAV)**: see your tasks in calendar and reminder apps on your phone or computer, with an app password. See [Calendar apps](caldav.md).
- **Webhooks**: send a message to another service when tasks change. See [Webhooks](webhooks.md).
- **API tokens**: keys for scripts and the `ot` command-line client. A token is shown once, when you create it. Read-only tokens can't change anything; tokens for an AI assistant that can make changes work only through the assistant tools and never on the rest of the API. See [HTTP API](api.md) and [Command-line client](cli.md).

### AI

- **Assistant**: the in-app assistant, when the server owner has turned it on: your consent, which assistant you use (the server's, or your own Anthropic, OpenAI or Gemini provider, model and key, if allowed), this month's usage, **Apply small changes without review (this device)** and **Clear conversations on this device**. The owner also chooses the provider, models, keys, network and monthly allowance here. See [AI assistant](assistant.md).
- **AI assistants**: give an AI assistant read-only access to your tasks, or, when the server owner allows it and you switch on **Allow AI assistants to make changes**, a token for an assistant that can make changes you can undo. See [AI assistants (MCP)](mcp.md). A token you create here is also listed under **Integrations → API tokens**.

## Server

Only the owner and admins see this group; **Backups** and **Access policies** are for the owner only.

### Administration

- **Users**: everyone with an account, their role and last sign-in. Make someone an admin (owner only), deactivate or reactivate an account, create a password reset link, or delete an account.
- **Members**: invite people with a single-use link. See [Sharing and comments](sharing.md#invite-someone-new).

### Backups

Scheduled backups to a folder, S3 or WebDAV, the last run and its result, and the next one. **Restore from a backup** puts the whole server back to an archive from the destination or one you upload: you see a verified preview first, type `RESTORE` to confirm, and the server restarts into the restored data. **Undo last restore** puts the previous database back, and old safety copies can be deleted to free space. See [Backups](backups.md#restore-from-the-web-app).

### Access policies

- **Two-factor policy**: optional, required for the owner, or required for everyone. See [Account security](account-security.md#turn-on-two-factor-authentication).
- **Single sign-on**: sign-in through your company or family identity provider. See [Single sign-on](self-hosting/sso.md).
- **Project invite links**: **Members can invite new people with project links** (off by default) lets links that members create in a project's Share dialog also create accounts. See [Who can bring new people](sharing.md#who-can-bring-new-people).

Running the server itself is covered in [Running with Docker](self-hosting/docker.md).
