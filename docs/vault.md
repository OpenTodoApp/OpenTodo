---
title: Markdown vault
summary: Keep a folder of Markdown files in two-way sync with your account, readable by Obsidian Tasks and Dataview, plus your TaskNotes task notes, with ot vault.
audience: developer
section: Integrations
specs: [cli-client, markdown-vault]
screens: []
order: 25
---
# Markdown vault

`ot vault` keeps a folder of Markdown files in two-way sync with your account, one file per project and one Obsidian Tasks line per task. Every edit becomes an ordinary change on your other devices, and theirs reach the files.

```bash
ot vault init ~/Notes/Tasks     # new or empty folder; --adopt accepts .md files
ot vault sync ~/Notes/Tasks     # --dry-run plans; --read-only pushes nothing
ot vault status ~/Notes/Tasks   # changed and conflict files, offline
ot vault watch ~/Notes/Tasks    # keep syncing until Ctrl+C
ot vault tasknotes <folder>     # also sync a TaskNotes folder (see below)
```

It needs a `full` token, and it is the one part of `ot` that keeps data locally: the files and `.opentodo/state.json`.

## The files

`Inbox.md` holds tasks without a project; each project is `<name>.md`, or the folder note `<name>/<name>.md` beside its sub-projects. Renaming a file renames the project, moving it into a folder nests it, a new `.md` file is a new project. A deleted file is written again.

<!-- fixture: Home.md -->
```markdown
---
opentodo-id: p-home
opentodo-color: "#22c55e"
opentodo-icon: house
aliases: [flat]
---

Things for the flat. The task lines sync with OpenTodo; this paragraph stays here.

- [ ] Book the plumber 📅 2026-10-25 [time:: 09:00] [deadline:: 2026-10-30] [estimate:: 45m] ⏫ #errands ⛔ t-home2 🆔 t-home1
- [ ] Fix the boiler 🔺 [origin:: https://github.com/acme/flat/issues/7] [tracked:: 1h20m] 🆔 t-home2
  Call before 9.

  * [ ] find the manual
  - [ ] Order the part 🛫 2026-10-22 🆔 t-home3
- [ ] Pay rent 📅 2026-11-01 🔁 every month #bills 🆔 t-home4
- [x] Return the drill ✅ 2026-10-19 🆔 t-home5

## Ideas

- a new lamp
- paint the hall

## Weekend

- [ ] Clean the windows [someday:: true] [evening:: true] 🆔 t-home6
```

| Field | Meaning |
| --- | --- |
| `📅` `[time:: ]` `[tz:: ]` | do-on date, time, zone |
| `🛫` `[someday:: true]` `[deadline:: ]` | start, Someday, deadline |
| `[estimate:: 45m]` `[evening:: true]` | estimate, This Evening |
| `🔺` `⏫` `🔼` | priority 1–3 (`🔽` `⏬` read as 4) |
| `🔁` | repeat rule (`when done`: after completion) |
| `#tag` `⛔` `✅` `🆔` | label, blocked by, done date, id |
| `[origin:: ]` `[location:: ]` `[tracked:: ]` `[field:Name:: ]` | read-only |

A line without `🆔` creates a task. Indented lines are subtasks, other indented text the note. A `##` heading over task lines is a section. Unknown text (`⏳`, `[[links]]`) and prose stay.

## In Obsidian

Make the vault a sub-folder of your Obsidian vault and install Tasks. With Dataview:

```dataview
TASK FROM "Tasks" WHERE !completed AND deadline <= date(today) + dur(7 days)
```

## Merging

| Since the last sync | Result |
| --- | --- |
| Changed in the file or the app | the change reaches the other side |
| Same field changed on both | the app wins; the line goes to `<file>.conflict.md` |
| Line removed, task unchanged | task trashed |
| Line removed, task changed | line written back |
| Project archived | file removed, or renamed `.conflict.md` if edited |

## TaskNotes

If you keep bigger tasks as notes with the Obsidian plugin [TaskNotes](https://github.com/callumalpass/tasknotes), link its folder to the vault. Each task note becomes one OpenTodo task, so it shows in Today, the calendar and your reminders, and simple tasks can stay as lines.

```bash
ot vault tasknotes ~/Notes/TaskNotes/Tasks   # in the vault folder, or --vault ~/Notes/Tasks
ot vault sync
ot vault tasknotes --off                      # unlink; the notes keep their ids
```

Use a folder next to the vault folder. A folder inside it needs `--inside`, and then every machine that syncs the vault needs this version of `ot`: older ones read the notes as project files. The vault reads your TaskNotes settings (`.obsidian/plugins/tasknotes/data.json`, found above the folder) on every sync: renamed fields, your statuses and which count as done, your priorities and the task tag or property. Without that file it uses TaskNotes' defaults and says so.

A note is matched to its task by `opentodo-id` in its frontmatter, a key TaskNotes leaves alone. A task note without it creates a task and gets the key, and nothing else in the note changes. Only the keys whose value changed are rewritten; key order, comments and keys the vault doesn't know stay byte for byte.

<!-- fixture: ../tasknotes/notes/Call-the-plumber.md -->
```markdown
---
title: Call the plumber
status: in-progress
priority: high
scheduled: 2026-11-03T09:30
due: 2026-11-06
timeEstimate: 30
recurrence: DTSTART:20261103;FREQ=MONTHLY;BYMONTHDAY=3
projects:
  - "[[Home]]"
contexts:
  - phone
tags:
  - task
  - errands
timeEntries:
  - startTime: 2026-10-27T08:00:00.000Z
    endTime: 2026-10-27T08:20:00.000Z
    description: First call
complete_instances:
  - 2026-10-03
dateCreated: 2026-10-01T09:00:00.000+02:00
dateModified: 2026-10-27T10:20:00.000+01:00
opentodo-id: t-plumber
---

Ask about the boiler too.
```

| TaskNotes field (default name) | OpenTodo |
| --- | --- |
| `title` (or the file name) | title |
| `status` | done when it is a status TaskNotes counts as completed; open statuses such as `in-progress` are kept as written |
| `priority` | the priorities above your default, highest first, are 1, 2, 3; the default and below are 4 |
| `scheduled` | do-on date and time |
| `due` | deadline (a time of day in it is kept, not synced) |
| `tags` (not the task tag) and `contexts` | labels |
| `projects` | the first link that names a project file of the vault; otherwise the Inbox |
| `timeEstimate` | estimate, in minutes |
| `recurrence`, `recurrence_anchor` | repeat rule; the `DTSTART` part is kept |
| `complete_instances` | listing the current occurrence's date completes it |
| `completedDate` | done date |
| `timeEntries` | your time entries (other members' are read-only) |
| the note's text | description |

`dateModified` is set whenever the vault changes a value. `dateCreated`, `blockedBy`, reminders, pomodoros, calendar links and any other key are kept but not synced. A rule OpenTodo can't express (hourly, several weekdays per month…) or a value in a form the vault can't read makes that one field read-only for the note, with a warning.

Merging works as for lines. When the same field changed on both sides the app wins, and the note's value goes to `tasknotes.conflict.md` in the vault folder.

| Since the last sync | Result |
| --- | --- |
| Note deleted, task unchanged | task trashed |
| Note deleted, task changed | note written back |
| Task trashed in the app, note unchanged | note removed (the task, with its text, is in the trash) |
| Task trashed in the app, note edited | note kept and no longer synced; reported as a conflict |
| Note archived in TaskNotes | not synced in either direction until the archive tag is removed; then the app's values are written to it |

The vault doesn't write new notes for tasks created elsewhere: those go to project files. `ot vault status` lists changed task notes too, and `ot vault watch` watches the linked folder.

## Limits

1 MB and 5,000 task lines per file, 20,000 tasks, 64 KB per note. A task note counts as one task. Over a limit, nothing is written or sent.

## Encrypted accounts

Run `ot encryption unlock` first: the server sees only ciphertext, but the files and task notes are plain text. A value that can't be decrypted shows as "Encrypted item" and is never sent back. Run `ot encryption lock` when done.
