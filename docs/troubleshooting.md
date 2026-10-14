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

Most problems have a quick fix. Start with the section that matches what you see. If nothing here helps, the person who runs your server can look at its logs, or you can [open an issue](https://github.com/pixari/opentodo/issues) on GitHub.

## A task seems to be missing

Check these places, in this order:

1. **A filter above the list.** If **Quick wins**, **Under 30 min**, **Over 1 h** or **Unestimated** is switched on, the list shows only matching tasks. Select it again to clear it.
2. **Completed.** It may have been ticked off by accident. Open **Completed** and reopen it.
3. **Trash.** It may have been deleted, or its project was. See [Trash and history](trash-and-history.md).
4. **An archived project.** Tasks of archived projects don't appear in Today or Upcoming.
5. **A folded parent or section.** Select the small arrow to unfold it.
6. **A shared project you left** or were removed from. Ask its owner.

The **Filter** view with `search: word` (add `& completed` to include finished tasks) searches titles and notes.

## Changes don't show up on my other device

- Look at the status at the top right of both devices. **Offline · 3 pending** means the changes are still waiting on that device; they're sent as soon as it's online.
- Click the status to sync right away.
- **Sync error**: hover over it to see the reason. If the server is down or being updated, it clears up once the server is back.
- **Signed out**: your session ended. Sign in again; waiting changes are sent afterwards.
- **Locked**: your account uses [encryption](e2ee.md). Enter your passphrase on that device.

See [Offline and sync](offline-and-sync.md) for what each status means.

## I can't sign in

- Check the email address and that Caps Lock is off. Passwords are at least 10 characters.
- After several failed attempts, the server makes you wait a little before trying again.
- **Forgot your password?** OpenTodo doesn't send reset emails. Ask the owner or an admin of your server for a reset link. If you are the owner, see [recovering owner access](self-hosting/docker.md#recovering-owner-access).
- **Lost your two-factor phone?** Use one of your recovery codes instead of the code. Without them, the server owner can reset your two-factor authentication.

## The demo says my sandbox expired

Demo sandboxes are deleted after two hours without activity, after 24 hours at most, and every night. Select **Start a new sandbox** to get a fresh one. Nothing from the old sandbox is kept.

## Reminders don't arrive

Inside the app, reminders pop up while it's open. To get them when the app is closed, push notifications must be turned on for each device in **Settings → Notifications**, and on an iPhone only the installed app can receive them. [Notifications](notifications.md#when-notifications-dont-arrive) lists the messages you might see and what to do.

## I can't install the app or add a passkey

Both need your server to be on a secure `https://` address. If the browser offers no install option, or **Settings** has no Security section for passkeys, ask whoever runs your server. Instructions per device are in [Installing the app](install-app.md).

## Quick add got it wrong

If a word was read as a date, project or priority by mistake, select the **×** on its chip before you press <kbd>Enter</kbd>, or press <kbd>Backspace</kbd> twice at the end of the line. Text in double quotes is never interpreted: `Read "Next Friday"`. You can also switch parsing off in **Settings → Capture → Quick add**. See [Quick add syntax](quick-add.md#preview-chips).

## I can't edit a shared project

Your role in that project is **viewer**, which is read-only. Ask the owner or an admin to make you an editor. See [Sharing and comments](sharing.md#choose-a-role).

## I can't share a project with someone

You can only add people who have an account on your server. Ask an admin of the server to [invite them](sharing.md#invite-someone-new) first. Accounts with end-to-end encryption turned on can't share new projects.

## The app looks out of date

The app updates itself when your server is updated. If something still looks old, close it completely (all tabs or the installed window) and open it again.

## Something went wrong on screen

If a part of the app fails to display, you see a message with a **Reload** button. Your tasks are stored on the device and aren't lost by reloading.

## Frequently asked questions

### Does OpenTodo work without internet?

Yes. Each device keeps a full copy of your tasks, and changes are sent when you're back online. See [Offline and sync](offline-and-sync.md).

### Where are my tasks stored?

On your devices and on the OpenTodo server you use. Nothing goes to anyone else: the app has no tracking and no analytics, and it only talks to your own server.

### Is there an app in the app stores?

No. OpenTodo is a web app that you install from your server's address, and it then behaves like any other app. See [Installing the app](install-app.md).

### Can I use OpenTodo on my own, without a server?

OpenTodo needs a server to sign in and sync, but it can be small: a single container on a Raspberry Pi or a cheap virtual server is enough. To try it first, use the [demo](https://opentodo-demo.pixari.dev). Setting up a server is described in [Running with Docker](self-hosting/docker.md).

### Can I move my tasks from another task app?

Usually, yes. OpenTodo imports CSV files and the JSON exports of other task apps. See [Import and export](import-export.md).

### Can several people use one server?

Yes. The owner invites people, each person has their own account and private tasks, and projects can be shared between them. See [Sharing and comments](sharing.md).

### What does it cost?

Nothing. OpenTodo is free software under the AGPL-3.0 licence. There's no subscription and no paid tier.
