---
title: Switch from Vikunja
summary: Bring your Vikunja projects, sub-projects, Kanban buckets, tasks, labels, repeats, reminders, relations and attachments to OpenTodo with Vikunja's data export.
audience: user
section: Switch from another app
specs: [data-import]
screens: []
order: 110
---
# Switch from Vikunja

Vikunja can export all your data as one ZIP. OpenTodo reads that ZIP as it is: your projects, their Kanban buckets, tasks, labels, repeats, reminders, relations and attached files come with you.

## Export from Vikunja

1. In Vikunja, open your avatar menu and choose **Settings → Export your data** (Vikunja 0.22 and later).
2. Enter your password and select **Request a copy of my Vikunja data**.
3. When Vikunja says the export is ready (it also sends an email when the server can send mail), go back to the same page and select **Download a copy of my data**. Keep the ZIP as it is; do not unpack it.

## Import into OpenTodo

1. Open **Settings → Data → Import data** (or press `g` then `Shift+I`).
2. Choose the ZIP. The preview shows **Vikunja (export ZIP)**.
3. Check the warnings and select **Import**.

## What carries over

- Projects and sub-projects; archived projects arrive archived.
- Your Vikunja Inbox: its tasks go to your Inbox (or the project you choose as the target).
- The buckets of a project's Kanban board become sections, and the project opens as a board. The done bucket is not made a section; its tasks arrive completed. A project whose open tasks all sit in one bucket gets no sections.
- Task titles and descriptions (as text with paragraphs, lists and links), done tasks with when they were done, due dates with their time, start dates.
- Priority: DO NOW and Urgent become priority 1, High priority 2, Medium priority 3, Low and unset priority 4.
- Labels.
- Repeats of a whole number of days ("every 7 days"), monthly repeats, and repeats from the done date ("after completion").
- Reminders at a fixed time, and reminders before or after the due date or the start date.
- Subtasks, and "blocked by" relations as [dependencies](../notes-and-subtasks.md#wait-for-another-task).
- Attached files, stored on your server like files you attach yourself.
- Comments, added under the description with their date.
- Each task remembers its Vikunja id, so importing the same ZIP again skips what is already there.

The full mapping is in [Import formats](../import.md#vikunja-vikunja-export).

## What does not

- End dates and reminders relative to the end date are dropped with a warning.
- Repeats in hours, and relations other than subtasks and "blocked by" (related, duplicates, precedes and follows, copied from), are dropped with a warning.
- Assignees: an import only adds tasks to your account; [share the project](../sharing.md) and assign them again.
- Colours, percent done, favourites, saved filters, project backgrounds and the other views (List, Gantt, Table) are not imported.
