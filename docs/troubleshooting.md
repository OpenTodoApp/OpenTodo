---
title: Troubleshooting and FAQ
summary: Fixes for the usual hiccups, from a task that seems to be missing to reminders that don't arrive, and answers to common questions.
audience: user
section: Guides
specs: []
screens: []
order: 150
card: signin
---
# Troubleshooting and FAQ

<picture><source srcset="images/sync-status-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/sync-status-light.webp" alt="The status at the top right reads Offline · 12 pending, above an Inbox with the duration filter chips."></picture>

Most problems have a quick fix. Start with the section that matches what you see; each links to the full steps. If nothing helps, whoever runs your server can look at its logs, or you can [open an issue](https://github.com/pixari/opentodo/issues) on GitHub.

## A task seems to be missing

Look for a duration filter chip in the list's header, then in **Completed**, the Trash, archived projects and folded parents. [Where to look, in order](troubleshooting-sync.md#a-task-seems-to-be-missing).

## Changes don't show up on my other device

**Offline · 3 pending** at the top right means the changes are still waiting on that device; click the status to sync right away. [What Sync error, Signed out and Locked mean](troubleshooting-sync.md#changes-dont-show-up-on-my-other-device).

## I can't sign in

Check the email address and that Caps Lock is off. OpenTodo doesn't send reset emails: ask the owner or an admin of your server. [Forgotten passwords, two-factor phones and the owner account](troubleshooting-sync.md#i-cant-sign-in).

## The demo says my sandbox expired

Sandboxes are deleted after two hours without activity. Select **Start a new sandbox**. [How long a sandbox lasts](troubleshooting-sync.md#the-demo-says-my-sandbox-expired).

## Reminders don't arrive

Push notifications must be on for each device in **Settings → Notifications**. [What to check, and iPhones](troubleshooting-app.md#reminders-dont-arrive).

## I can't install the app or add a passkey

Both need your server to be on a secure `https://` address. [What to ask whoever runs your server](troubleshooting-app.md#i-cant-install-the-app-or-add-a-passkey).

## Quick add got it wrong

Select the **×** on the wrong chip, or put the words in double quotes: `Read "Next Friday"`. [More ways to stop it](troubleshooting-app.md#quick-add-got-it-wrong).

## I can't edit a shared project

Your role in that project is **viewer**, which is read-only. [Who can change it](troubleshooting-sync.md#i-cant-edit-a-shared-project).

## I can't share a project with someone

You can only add people who have an account on your server. [Invitations and encrypted accounts](troubleshooting-sync.md#i-cant-share-a-project-with-someone).

## The app looks out of date

The app updates itself when your server is updated. [What to do if something still looks old](troubleshooting-app.md#the-app-looks-out-of-date).

## Something went wrong on screen

If a part of the app fails to display, you see a message with a **Reload** button. [Why reloading is safe](troubleshooting-app.md#something-went-wrong-on-screen).

## Frequently asked questions

### Does OpenTodo work without internet?

Yes. Each device keeps a full copy of your tasks, and changes are sent when you're back online. See [Offline and sync](offline-and-sync.md).

### Where are my tasks stored?

On your devices and on the OpenTodo server you use. Nothing goes to anyone else: the app has no tracking and no analytics, and it only talks to your own server.

### Is there an app in the app stores?

No. OpenTodo is a web app that you install from your server's address, and it then behaves like any other app. See [Installing the app](install-app.md).

### Can I use OpenTodo on my own, without a server?

OpenTodo needs a server to sign in and sync, but it can be small: a single container on a Raspberry Pi or a cheap virtual server is enough. To try it first, use the [demo](https://demo.open-todo.app). See [Running with Docker](self-hosting/docker.md).

### Can I move my tasks from another task app?

Usually, yes. OpenTodo imports CSV files and the JSON exports of other task apps. See [Import and export](import-export.md).

### Can several people use one server?

Yes. The owner invites people, each person has their own account and private tasks, and projects can be shared between them. See [Sharing and comments](sharing.md).

### What does it cost?

Nothing. OpenTodo is free software under the AGPL-3.0 licence. There's no subscription and no paid tier.
