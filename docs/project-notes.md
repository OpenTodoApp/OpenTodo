---
title: Project notes
summary: The note at the top of a project: what it is for, who can edit it, Shift+P, folding long notes, and how the API and history see it.
audience: user
section: Guides
# `project-notes` is this page's capability; it is named here once the change is archived (the docs check knows live specs only).
specs: [project-organization, rich-text-editing]
screens: []
order: 18
---
# Project notes

<picture><source srcset="images/project-list-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/project-list-light.webp" alt="The Home renovation project with its tasks grouped under the sections Planning and In progress."></picture>

Every project can have a note at the top: the goal, the links you keep looking up, the rules of a shared shopping list, a packing list, who to call. It sits above the tasks in the list, the board and the timeline, so the brief is read before the work.

## Add or edit the note

- Select **Add a note** under the quick add, click the note itself, or press <kbd>Shift</kbd>+<kbd>P</kbd> anywhere in the project while no text field has focus.
- The note opens in place, in the same editor as task notes: start a line with `- ` for a bullet list, `[ ] ` for a checklist or `# ` for a heading, press <kbd>Ctrl</kbd>+<kbd>B</kbd> for bold or <kbd>Ctrl</kbd>+<kbd>K</kbd> for a link (<kbd>⌘</kbd> on a Mac). See [Notes, subtasks and dependencies](notes-and-subtasks.md#write-notes).
- To finish, press <kbd>Esc</kbd> or select **Done**. The note is saved as you type, offline too, and reaches your other devices with the next sync.

A note with headings and check items is shown with those headings and boxes at rest; ticking a box happens in the editor.

## Who can edit it

In a project of your own, you. In a shared project, the owner, admins and editors can edit the note; viewers read it. When the note is empty, people who may edit see the quiet **Add a note** line and viewers see nothing. The roles are explained in [Roles and assignments](roles-and-assignments.md#choose-a-role).

Two people can edit the note at the same time, also offline, and both sets of changes are kept, as with task notes. Another member's change appears while you type without moving your cursor.

## Long notes

A note longer than about eight lines is folded with a **Show more** control. The choice is remembered on each device separately, so a folded note on your laptop is still open on your phone.

## History, scripts and assistants

The project's **History** (in the project's **⋯** menu) lists note changes as edits of the notes, shows the text before and after, and can put back an earlier version; see [Trash and history](trash-and-history.md).

Scripts and the [API](api.md) read and write the note as Markdown in the project's `description`; a change made there is folded into the note on the next device that opens the project. Exports and backups carry the note with the project, and importing a JSON file that lists projects with a `description` sets it on the projects it creates. AI assistants over [MCP](mcp.md) and the in-app assistant see the description, read-only.

For an [encrypted account](e2ee.md), the note is encrypted on your devices like task notes and project names.
