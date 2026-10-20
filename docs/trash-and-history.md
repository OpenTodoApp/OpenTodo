---
title: Trash and history
summary: Restore deleted tasks and projects from the Trash, see every change made to a task, and bring back an earlier value.
audience: user
section: Guides
specs: [trash-and-history]
screens: [trash#restore-something-from-the-trash]
order: 130
card: trash
---
# Trash and history

<picture><source srcset="images/trash-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/trash-light.webp" alt="The Trash with a deleted project and two deleted tasks, each with Restore and Delete permanently buttons."></picture>

Deleting something in OpenTodo doesn't make it vanish. It goes to the Trash first, and every change to a task is kept in its history, so a slip of the finger is easy to undo.

## Restore something from the Trash

Open **Trash** in the sidebar (or press <kbd>g</kbd> <kbd>x</kbd>). It lists deleted tasks and projects, newest first, with when they were deleted and how many days they have left.

Select **Restore** next to an item. It comes back exactly where it was:

- A restored project returns to its place in the sidebar, with all its tasks.
- A restored task returns to its project. If that project is still in the Trash, the task goes to your Inbox instead.

With the keyboard: <kbd>j</kbd> / <kbd>k</kbd> to select, <kbd>r</kbd> to restore.

## Delete for good

**Delete permanently** removes one item for good, and **Empty Trash** removes everything in it. Both ask you to confirm, and both need a connection. Once something is permanently deleted, it's gone from every device and from the server, and it can't come back.

Items are also deleted for good automatically after 30 days in the Trash. Your server's owner can change that period or turn it off.

## What deleting does

- Deleting a task also deletes its subtasks.
- Deleting a project hides it and its tasks everywhere. Its sub-projects move up a level, so they aren't lost.
- Reminders on deleted tasks stay quiet. Restore the task and they work again.
- Deleted items are still in your [export](import-export.md#download-everything) until they are deleted for good.

## See what changed on a task

Open a task and select the **History** tab below its details: every change, grouped into versions, newest first, with who made it, from where and when. Projects have a **History** too, in the **⋯** menu of the project's header. See [Task history](task-history.md#see-what-changed-on-a-task).

## Bring back an earlier value

Next to each change in the history is **Restore this value**, and **Restore this version** puts back everything a version changed. See [Task history](task-history.md#bring-back-an-earlier-value).

## Undo a bulk action

After you change several tasks at once, a notice with **Undo** stays for ten seconds; <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd> undoes too. Tasks moved to the Trash in bulk come back with it, and so do the originals of a move into a shared project (the copies go to the Trash). Undo works offline. See [Change several tasks at once](bulk-actions.md).

## Activity on a task

The **Activity** tab of a task shows who created it, completed it, moved it or changed the date, newest first, also offline. See [Task history](task-history.md#activity-on-a-task).

## Archived projects

Archiving is different from deleting: an archived project disappears from the sidebar, but it isn't in the Trash and isn't deleted after 30 days. OpenTodo offers to archive a project when you complete its last task, and archives projects without open tasks for 30 days. See [Archived projects](archived-projects.md).

### Bring back an archived project

Open the **Projects** page (**All** next to **Projects** in the sidebar, or **Show archived projects** in **Settings → Data**) and select **Restore** next to the project under **Archived projects**. See [Bring back an archived project](archived-projects.md#bring-back-an-archived-project).
