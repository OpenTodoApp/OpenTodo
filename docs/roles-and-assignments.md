---
title: Roles and assignments
summary: What viewers, editors, admins and the owner can do in a shared project, leaving or handing over a project, and assigning tasks to members.
audience: user
section: Guides
specs: [project-sharing, task-assignment]
screens: [settings/invitations#when-someone-is-asked-first]
order: 72
---
# Roles and assignments

<picture><source srcset="images/share-dialog-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/share-dialog-light.webp" alt="The Share dialog for Home renovation: an email field, a role menu set to editor, and the member list with the owner and one editor."></picture>

Every member of a shared project has a role that says what they can do, and every task in it can be assigned to one of them. Both are set in the Share dialog and the task panel; [Sharing and comments](sharing.md) has the overview.

## Choose a role

| Role | Can |
| --- | --- |
| **viewer** | see the project and its tasks, and comment |
| **editor** | also add, edit, complete and delete tasks, assign them, and edit the project's [note](project-notes.md) |
| **admin** | also rename, recolor and archive the project, and manage members |
| **owner** | everything, including deleting the project and handing it over |

Every project has exactly one owner. To change someone's role, open **Share** and pick a new one next to their name. **Remove** takes them out of the project.

For viewers, the project is read-only: the add box and edit controls are switched off, with a note saying so.

## When someone is asked first

Adding someone by email who shares no project or [workspace](workspaces.md) with you yet sends them an invitation instead of the project: it shows in their notifications with **Accept** and **Decline**, in **Settings → Account → Invitations**, and by email when your server sends email. The project reaches them only once they accept. Until then **Share** lists the address under **Waiting for an answer**, where **Cancel** withdraws it. Adding someone to a workspace works the same way.

The dialog answers the same whether or not the address has an account, so nobody can use it to find out who is on the server: an address without an account simply never answers. Invitations expire after 14 days, and someone who declines is not asked again by the same project for 14 days. For someone without an account, use an [invite link](sharing.md#invite-with-a-link).

## Leave or hand over a project

- **Leave**: in the Share dialog, select **Leave** next to your own name. The project disappears from your devices; everyone else keeps it.
- **Make owner**: the owner can hand the project to another member. The previous owner becomes an admin. Owners can't leave until they've done this.

When someone leaves or is removed, tasks assigned to them become unassigned.

## Assign tasks

In a shared project, each task can be assigned to one member. Open the task and choose someone under **Assignee**, or select the task and press <kbd>Shift</kbd>+<kbd>A</kbd>, type a name and press <kbd>Enter</kbd>. The assignee's avatar shows on the row, and they get a notification.

**Assigned to me** in the sidebar (<kbd>g</kbd> <kbd>a</kbd>) lists every open task assigned to you, across projects.

In your Inbox, in a project you haven't shared, or in a shared project where you are the only member, nobody else can be assigned, so the **Assignee** row reads **You**. That is only how the panel shows it: such a task is not in **Assigned to me** unless you turn on **Show in Assigned to me** in the same row, which assigns it to you. Turning it off unassigns it again. When you share the project with someone, its unassigned tasks read **Unassigned** from then on, and the tasks you assigned to yourself stay yours.
