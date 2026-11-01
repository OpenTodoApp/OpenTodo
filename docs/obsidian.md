---
title: Obsidian plugin
summary: Send a line or a selection from any Obsidian note to OpenTodo as tasks that link back to the note, on desktop and mobile, offline and with encrypted accounts.
audience: user
section: Reference
specs: [offline-first-sync, markdown-vault]
screens: []
order: 52
---
# Obsidian plugin

The OpenTodo plugin for [Obsidian](https://obsidian.md) turns a line of a note into a task on your own server. Write `Call the plumber tomorrow 9am p2` in today's daily note, run **Send line to OpenTodo**, and the task is in your Inbox on every device, with a chip that opens the note again. It runs on Obsidian for desktop and for phones and tablets, works offline, and works with [end-to-end encrypted](e2ee.md) accounts.

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

## How it differs from `ot vault`

[`ot vault`](vault.md) keeps a folder of project files in two-way sync from a computer: every task is a line, and changes flow both ways. The plugin captures: it sends lines from any note, on any device Obsidian runs on, and leaves a link behind. Both use the same task-line grammar, and they work side by side: a task sent from a daily note appears in its project's file with its `[origin:: obsidian://…]` link.
