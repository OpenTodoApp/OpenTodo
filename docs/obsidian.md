---
title: Obsidian plugin
summary: Send lines from any Obsidian note to OpenTodo as tasks that link back to the note, and keep a folder of task files in two-way sync, on desktop and mobile, offline and encrypted.
audience: user
section: Reference
specs: [offline-first-sync, markdown-vault]
screens: []
order: 52
---
# Obsidian plugin

The OpenTodo plugin for [Obsidian](https://obsidian.md) turns a line of a note into a task on your own server. Write `Call the plumber tomorrow 9am p2` in today's daily note, run **Send line to OpenTodo**, and the task is in your Inbox on every device, with a chip that opens the note again. It can also keep a folder of task files in two-way sync with OpenTodo, the way [`ot vault`](vault.md) does, on a phone too. It runs on Obsidian for desktop and for phones and tablets, works offline, and works with [end-to-end encrypted](e2ee.md) accounts.

## Install

- **From Obsidian**: Settings → Community plugins → Browse, search for "OpenTodo", install and enable it.
- **By hand**: download `main.js`, `manifest.json` and `styles.css` from the latest release of [OpenTodoApp/obsidian-opentodo](https://github.com/OpenTodoApp/obsidian-opentodo/releases) into the folder `.obsidian/plugins/opentodo/` of your vault, then enable **OpenTodo** under Settings → Community plugins.
- **With [BRAT](https://github.com/TfTHacker/obsidian42-brat)**: add the beta plugin `OpenTodoApp/obsidian-opentodo`.

The plugin needs OpenTodo 0.19.1 or newer on the server and Obsidian 1.8.7 or newer.

## Connect

1. In OpenTodo, open **Settings → Integrations → API tokens**, pick **New token**, keep **Full access** and name it after the device, for example "Obsidian on my phone". The plugin writes tasks, so it needs a full token: a read-only token cannot write, and an assistant token is for AI assistants and labels its changes as theirs.
2. In Obsidian, open **Settings → OpenTodo** (under Community plugins), enter your server's address (`todo.example.com`), paste the token and pick **Connect**. The tab then shows your account, the server's version, whether the account is encrypted and how many tasks are waiting.

The token stays in Obsidian's storage on this device. It is never written into the vault (the plugin's `data.json` holds only the three settings below), so a vault that Obsidian Sync, iCloud or git copies to another device arrives there unconnected: connect each device with its own token, and you can revoke one device's token without touching the others. **Disconnect** removes the token, the cached projects and labels and a remembered key from the device.

The address must use `https`. Plain `http` works only for this device and your own network (`localhost`, `192.168.…`, `10.…`, `.local` names), after a warning and a second **Connect**. The plugin talks to that one server only and collects nothing: no analytics, no crash reports, no update check of its own.

## Send a line

Put the cursor on a line, or select several lines, and run **Send line to OpenTodo** from the command palette, the editor's context menu, or the toolbar on a phone (add it in Obsidian's mobile toolbar settings). Each non-empty line becomes one task, at most 50 at a time.

- A **checkbox line** is read like the [Tasks](https://publish.obsidian.md/tasks/) plugin and the [Markdown vault](vault.md): `- [ ] Renew passport 📅 2026-11-05 ⏫ #errand` is "Renew passport", do on 5 November, priority 2, label errand. It knows `📅` (do on), `🛫` (start), `🔺 ⏫ 🔼 🔽 ⏬` (priority), `#tags` (labels), `[time:: 09:00]`, `[estimate:: 45m]`, `[deadline:: 2026-11-30]`, `[someday:: true]`, `[evening:: true]`, `[daypart:: morning]` and `[energy:: deep]`.
- **Any other line**, a plain bullet included, is read like [quick add](quick-add.md): `Call the plumber tomorrow 9am p2 #Home @errand` is "Call the plumber", tomorrow at 09:00, priority 2, in the project Home, label errand. Dates are read in Obsidian's language and English.

A sheet shows each task's title (which you can change), what was recognised as chips (remove one and its words go back into the title) and the project: the line's own `#project`, else the plugin's **Default project**, else the Inbox. For a selection every line has a checkbox, so you can leave lines out. **Enter** sends, **Escape** cancels. Labels that do not exist yet are created. Projects you cannot add to (a shared project where you are a viewer) are not offered.

## What happens to the line

By default the line keeps its text and gains a link to the task, a [Dataview](https://blacksmithgu.github.io/obsidian-dataview/) inline field:

```markdown
Call the plumber tomorrow 9am p2 [opentodo:: https://todo.example.com/?task=8c2a…]
```

**After sending** in the plugin's settings can instead **mark the line done** (`- [x]`, with Tasks' own `✅` date when the line uses Tasks fields) or **remove the line**. For ten seconds the notice **Sent to OpenTodo** offers **Undo**, which puts every line back exactly and moves the task to OpenTodo's [Trash](trash-and-history.md).

A line that already carries an `[opentodo:: …]` link (or a vault `🆔`) is not sent again; the notice offers **Open in OpenTodo** instead. Ticking a sent line in Obsidian does not complete the task: the line is a capture, not a copy.

The task's origin is the note, `obsidian://open?vault=…&file=…`, so its chip opens the note in Obsidian (see [Capturing pages](capture.md)). When you rename or move the note in Obsidian on this device, the plugin updates the origin of every task linked from its lines. After a rename made elsewhere (another device, a file-sync service, the file manager), run **Fix OpenTodo links in this note**.

## Offline

Sending never waits for the network. The task is prepared on the device and kept in the plugin's outbox, and the line gets its link at once. Waiting tasks are sent when Obsidian starts, when the network returns, every minute while some wait, and with **Send pending to OpenTodo**; the settings tab (and the status bar on a computer) shows how many wait. Sending the same tasks twice after an interrupted connection creates nothing twice. A task the server refuses, for example because you became a viewer of its project meanwhile, is dropped from the outbox and named in a notice with the project, the reason and the note.

## Encrypted accounts

For an account with [end-to-end encryption](e2ee.md), the plugin asks for your passphrase (or recovery key) with **Unlock OpenTodo** and encrypts the title, the notes and the origin on the device before anything is queued, with the same code as the web app; project and label names are decrypted for the sheet. The key stays in memory until Obsidian closes. **Remember on this device** keeps it in Obsidian's storage on this device, so anyone who can open Obsidian there can read what is sent; it is off by default. While the account is locked, nothing is sent or queued and the line stays as it is.

## Sync a folder

The plugin can keep one folder of your Obsidian vault in two-way sync with OpenTodo, with the same files and rules as [`ot vault`](vault.md): one file per project (`Inbox.md`, `Home.md`, `Work/Work.md` with its sub-projects beside it), one Obsidian Tasks line per task, and `.opentodo/state.json` for what was last synced. Tick a line on your phone and the task is done everywhere; create a task in the app and its line appears in the file.

1. Connect the plugin (above), then open **Settings → OpenTodo → Sync a folder with OpenTodo**.
2. Pick the folder: **OpenTodo** (a new folder), any folder of the vault, or a folder that `ot vault` or the plugin on another device already syncs. A folder that holds notes but no `.opentodo/` asks first: its Markdown files become projects and their task lines tasks, as `ot vault init --adopt` does.
3. Pick **Turn on**. The first sync writes the files.

**When it syncs.** When the plugin starts, a second after you change a file in the folder, every 30 seconds while Obsidian is in front, when you come back to Obsidian, and with **Sync vault with OpenTodo now** from the command palette. It does not sync in the background or while Obsidian is closed: phones do not run plugins then. Edits made offline are sent at the next sync, and changes from other devices merge field by field as everywhere else. A sync that fails (no connection, the server down) changes no file and is tried again after 30 seconds, then 1, 2 and every 5 minutes; the settings tab shows why, and on a computer the status bar too.

**One device per folder.** If the folder also travels between your devices with Obsidian Sync, iCloud or git, only one device talks to OpenTodo for it: the folder's state names the device that syncs it, renewed on every sync. On the others the settings tab says **Synced by laptop** (or whichever device it is) and nothing is sent; an edit you make there reaches OpenTodo through the file-sync service and that device's next sync. When that device is gone for good, pick **Take over syncing here**: this device becomes the folder's new vault device, every line is compared with OpenTodo, a line that differs is kept in `<file>.conflict.md` with OpenTodo's values in the file, new lines become tasks once, and nothing is trashed. `ot vault sync --take-over` does the same on a computer. **Turn off** stops syncing and gives the folder up, so another device can sync it without taking over; the files stay.

**iCloud.** iCloud Drive may keep a file on the server until it is opened, leaving a `.<name>.icloud` placeholder. Such a file is skipped and its tasks are left alone until it has been downloaded.

**Encrypted accounts.** Unlock OpenTodo first; while it is locked, the sync is skipped and nothing is sent. Turning sync on asks you to confirm that the folder, and anything that copies the vault, holds your tasks in plain text. What is sent is encrypted on the device; a value that cannot be decrypted shows as "Encrypted item" and is never sent back.

A folder with a [TaskNotes](vault.md#tasknotes) folder linked keeps syncing with `ot vault`; the plugin does not sync it. Lines inside the synced folder are vault lines: **Send line to OpenTodo** refuses them, so no task is made twice.

## How it differs from `ot vault`

[`ot vault`](vault.md) and the plugin's folder sync follow the same rules and the same files, so a folder can move from one to the other. `ot vault` runs on a computer and can watch the folder with the server's live updates and sync TaskNotes notes; the plugin runs wherever Obsidian runs, phones included, while Obsidian is open. Sending a line is different: it captures a line from any note and leaves a link behind. Both use the same task-line grammar, and they work side by side: a task sent from a daily note appears in its project's file with its `[origin:: obsidian://…]` link.
