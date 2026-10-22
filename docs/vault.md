---
title: Markdown vault
summary: Keep a folder of Markdown files in two-way sync with your account, readable by Obsidian Tasks and Dataview, with ot vault.
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

## Limits

1 MB and 5,000 task lines per file, 20,000 tasks, 64 KB per note. Over a limit, nothing is written or sent.

## Encrypted accounts

Run `ot encryption unlock` first: the server sees only ciphertext, but the files are plain text. Run `ot encryption lock` when done.
