---
title: Notes, tasks and scripts
summary: Turn a note into a task and a task's note into a note, restore notes from the Trash, and read or add to notes from the command line and AI assistants.
audience: user
section: Guides
specs: [standalone-notes, trash-and-history, cli-client]
screens: []
order: 16
---
# Notes, tasks and scripts

<picture><source srcset="images/notes-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/notes-light.webp" alt="The Notes page: a search field, the Source, Project and Label filters, and five notes of tasks with their first line, project, labels and when they changed."></picture>

A note on the [Notes](notes.md) page can become a task, and a task's note can become a note of its own.

## Turning notes into tasks and back

- **Turn into task** (in a standalone note's menu) makes a task with the note's title, text, project and labels, and moves the note to the Trash.
- **Move note to a new note** (in a task's menu) moves the task's note out into a new standalone note titled like the task, in the task's project; the task keeps its title and its note becomes empty.

Both can be undone with **Undo**. Viewers of a shared project are offered neither. Both work offline and reach your other devices on the next sync.

## Trash

A deleted note goes to the [Trash](trash-and-history.md) with tasks and projects. Restore it from there, or delete it permanently; the Trash empties itself after the retention period like for tasks, and a project deleted permanently takes its notes with it.

## From scripts and assistants

`ot notes` lists, searches, shows, adds, edits, appends to and removes notes, and `ot task note` reads and writes a task's note as Markdown (see [the command line](cli.md)). AI assistants connected over [MCP](mcp.md) can read and search notes and, when you allow it, create and change them. Text added this way is appended at the end of the note without replacing what you wrote, even while you edit the same note on another device. A replacement of the whole text is refused when the note changed since the script or assistant read it.

Notes are not sent to calendar apps over CalDAV, to webhooks, to the activity feed, to automations or to the Markdown vault.
