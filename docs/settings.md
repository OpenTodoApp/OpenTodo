---
title: Settings
summary: A tour of Settings, what each section does, which choices belong to one device and which follow your account.
audience: user
section: Guides
specs: [web-app, settings-navigation]
screens: [settings]
order: 140
card: settings
---

# Settings

<picture><source srcset="images/settings-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/settings-light.webp" alt="Settings on a wide screen: the list of sections with the profile card and the search field on the left, the Account section open on the right."></picture>

Open **Settings** from the menu of your name at the bottom of the sidebar, or press <kbd>g</kbd> then <kbd>s</kbd>. On a wide screen the sections are listed in the left column with the first, **Account**, open beside it; on a phone the list comes first and each section is its own page with a **← Settings** link back. The list starts with your profile card (initials, name, email, role) and **Search settings**, then the sections, each with an icon and a line saying what's inside, grouped under **You**, **App**, **Data** and, for the people who run the server, **Server**.

**Search settings** finds a setting by name or by what it does; matches are listed under their section and Enter opens the first with that row focused. The command palette (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd>) searches the same index: "passkey" lists **Account › Passkeys**.

Every section has its own address, such as `/settings/integrations`, to bookmark or share. Older links keep working: `/settings/security` opens **Account** at its security rows.

Inside a section, the setting the page is mostly about sits in a card at the top; the other groups follow, separated by a thin line. Each group leads with a heading and one sentence saying what it is for, then its settings as rows: label and description on the left, the control on the right (below the label on a narrow screen), and a badge with the current state. Forms with several fields open from a button; actions that remove something ask you to confirm first and say what will be lost.

Some settings follow your account to every device; others belong to the device you're on, marked "this device", so your phone and laptop can differ. Each section page has a **Help** button in its header that opens its part of this guide next to Settings.

The owner and admins also see **People**; the owner alone sees **Server**. On the public demo every section is listed, and the rows the demo refuses have their controls disabled, under a note at the top of the page naming them.

## You

Your account and how the app looks for you: [Settings: You](settings-you.md).

### Account

[Account](settings-you.md#account): your profile, **Sign out here**, password, two-factor authentication, passkeys, linked accounts, end-to-end encryption and recent activity.

### Appearance

[Appearance](settings-you.md#appearance): **Mode** (System, Light or Dark), one of eight colour **themes**, **Density** and which **More** destinations the sidebar shows, all following your account.

## App

How the app behaves: [Settings: App](settings-app.md).

### General

[General](settings-app.md#general): the [language](language.md), start view, date and time, calendar grid and keyboard.

#### Date and time

[Date and time](settings-app.md#date-and-time): the date format, time format and first day of the week, on all your devices.

### Notifications

[Notifications](notifications.md): push notifications for reminders on this device, and a test that shows whether they arrive. The [weekly digest](statistics.md#weekly-digest-by-email) emails last week's numbers on your review day.

### Capture

[Capture](settings-app.md#capture): quick add parsing and its languages, voice capture, the bookmarklet and extension, and email to task.

### About

[About](feedback-and-support.md#settings--about): version, docs, feedback and support.

## Data

Connections to other tools, and your data: [Settings: Data](settings-data.md).

### Integrations

[Integrations](settings-data.md#integrations): calendar apps (CalDAV), calendar feeds, webhooks, API tokens, the in-app assistant and AI assistants over MCP.

### Data

[Data](settings-data.md#data): export and import, attachments, the sync status of this device, and archiving and restoring projects.

## Server

Owner and admins only; **Server** and the access policies inside **People** are for the owner alone. Every row: [Settings: Server](settings-server.md).

### People

[People](settings-server.md#people): users and their roles, invitations, the two-factor policy, single sign-on and project invite links.

### Server

[Server](settings-server.md#server): backups and restore, attachment limits and the audit log. Running the server: [Running with Docker](self-hosting/docker.md).
