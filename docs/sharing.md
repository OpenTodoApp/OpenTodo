---
title: Sharing and comments
summary: Share a project with people on your server, choose what they can do, assign tasks, and talk it through in comments with @mentions.
audience: user
section: Guides
specs: [project-sharing, task-assignment, comments, invitations, activity-feed]
screens: [share-dialog#share-a-project, settings/members#invite-someone-new, settings/project-invites#who-can-bring-new-people, updates#see-what-others-changed]
order: 70
card: comments
---
# Sharing and comments

Projects can be shared with other people who have an account on the same OpenTodo server: your partner for the house move, your team for a launch. Everyone sees the same tasks, edits sync to everyone within seconds, and each task has a comment thread.

## Share a project

1. Open the project and select **Share** at the top (or press <kbd>Shift</kbd>+<kbd>S</kbd>).
2. Type the person's email address.
3. Pick a role and select **Share**.

<picture><source srcset="images/share-dialog-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/share-dialog-light.webp" alt="The Share dialog for Home renovation: an email field, a role menu set to editor, and the member list with the owner and one editor."></picture>

The project appears on their devices the next time they sync, with all its tasks. Shared projects have a small people icon in the sidebar.

Adding by email works only for people who already have an account on your server. For anyone else, send an invite link (next section).

## Invite with a link

An invite link adds one person to the project, whether or not they have an account yet.

1. Open **Share** and select **Create a link…** under **Invite with a link**.
2. Pick the role they get. Owners can also invite admins; admins can invite viewers and editors.
3. Optionally enter their email: then only an account with that address can use the link.
4. Choose how long it stays valid (1 hour to 30 days, 7 days by default) and select **Create link**.
5. Select **Copy link** and send it however you like. OpenTodo never sends it for you.

The link is shown only once and works once. The dialog lists the links that are still waiting, with their role, email, expiry and who created them; **Revoke** stops one from working. Creating and revoking links need a connection.

When the person opens the link they see who invited them, the project and the role:

- **Already have an account?** They select **Sign in to join**, sign in (with single sign-on too), and select **Join project**. Someone who is signed in already just selects **Join project**.
- **New to the server?** They select **Create an account**, choose a name and password, and land in the project. This option appears only when the link is allowed to create accounts (see below). Otherwise the page tells them to get an account on the server first, then come back and sign in.

A link stops working when it expires, is revoked or has been used, when the project is deleted, or when the person who created it is no longer the project's owner or an admin. Someone who is already a member is told so, and the link stays unused for whoever it was meant for.

### Who can bring new people

New accounts are created through a project link only when one of these is true:

- the link was created by the **owner or an admin of the server**;
- open sign-up is on for the server;
- the server owner switched on **Members can invite new people with project links** in **Settings → Access policies → Project invite links**. It is off by default.

When none applies, the Share dialog says so under the new link: it then works only for people who already have an account. The switch is checked when a link is used, so turning it on or off also affects links that were already sent.

## Share with a public link

A public link shows a project's list to anyone who has the link, with no account and no sign-in. Use it for a shopping list in a family group chat, or a packing list for friends.

1. Open **Share** on the project. You need to be its owner or an admin.
2. Under **Share with a public link**, optionally give the link a name (like "Group chat"), and choose:
   - **View only**: people can see the list.
   - **Can tick items**: people can also tick tasks off, and untick a mis-tap.
3. Choose when it expires (never, or after 1 to 90 days), then select **Create public link**.
4. Select **Copy link** and paste it wherever you like. It is shown only once.

The page shows the project's name, its open tasks by section with subtasks under them, due dates and priorities, and the tasks ticked in the last day. It never shows notes, labels, comments or who is on the project. A banner says the list is public, and on a tick link that anyone with it can tick items. The page refreshes every 30 seconds while it's open, and right after each tick. Ticks reach everyone's devices on their next sync, and show **Public link** as the person in history and activity.

While a project has an active public link, its header shows a **Public** badge. Select it to see the links, with their rights, expiry and when each was last opened. **Revoke** stops a link at once. A link also stops working while the project is archived or deleted, or if whoever created it loses the owner or admin role. Creating and revoking links needs a connection. Projects with end-to-end encryption can't be published, because the server can't read their tasks.

## Choose a role

| Role | Can |
| --- | --- |
| **viewer** | see the project and its tasks, and comment |
| **editor** | also add, edit, complete and delete tasks, and assign them |
| **admin** | also rename, recolor and archive the project, and manage members |
| **owner** | everything, including deleting the project and handing it over |

Every project has exactly one owner. To change someone's role, open **Share** and pick a new one next to their name. **Remove** takes them out of the project.

For viewers, the project is read-only: the add box and edit controls are switched off, with a note saying so.

## Invite someone new

Sign-up on an OpenTodo server is closed by default. The quickest way to bring someone into one project is an [invite link](#invite-with-a-link). To invite someone to the server without a project, if you're the owner or an admin of the server, go to **Settings → Administration → Members**, optionally enter their email, choose how long the link stays valid, and select **Create invitation**. Copy the link and send it to them however you like; OpenTodo doesn't send emails. The link works once.

<picture><source srcset="images/members-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/members-light.webp" alt="Settings, Members section: an email field, an expiry menu set to 7 days, a Create invitation button, and a list with one pending and one accepted invitation."></picture>

If you're not an admin of the server and your invite link can't create accounts, ask whoever runs it to invite the person, or to switch on **Members can invite new people with project links**. Once they've joined, you can share projects with them yourself.

## Leave or hand over a project

- **Leave**: in the Share dialog, select **Leave** next to your own name. The project disappears from your devices; everyone else keeps it.
- **Make owner**: the owner can hand the project to another member. The previous owner becomes an admin. Owners can't leave until they've done this.

When someone leaves or is removed, tasks assigned to them become unassigned.

## Assign tasks

In a shared project, each task can be assigned to one member. Open the task and choose someone under **Assignee**, or select the task and press <kbd>Shift</kbd>+<kbd>A</kbd>, type a name and press <kbd>Enter</kbd>. The assignee's avatar shows on the row, and they get a notification.

**Assigned to me** in the sidebar (<kbd>g</kbd> <kbd>a</kbd>) lists every open task assigned to you, across projects.

In your Inbox, in a project you haven't shared, or in a shared project where you are the only member, nobody else can be assigned, so the **Assignee** row reads **You**. That is only how the panel shows it: such a task is not in **Assigned to me** unless you turn on **Show in Assigned to me** in the same row, which assigns it to you. Turning it off unassigns it again. When you share the project with someone, its unassigned tasks read **Unassigned** from then on, and the tasks you assigned to yourself stay yours.

## Comment on a task

Open a task: **Comments** is the first tab below its details, next to **Activity** and **History**, and the panel remembers the tab you used last on this device. Press <kbd>Shift</kbd>+<kbd>C</kbd> with the task open to jump to the comment box from any tab. Comments read like a chat, oldest first, with the box at the end. Write your comment and post it with **Comment** or <kbd>Ctrl</kbd>+<kbd>Enter</kbd> (<kbd>⌘</kbd>+<kbd>Enter</kbd> on a Mac). If you close the task before sending, your draft is still there when you open it again on this device.

<picture><source srcset="images/comments-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/comments-light.webp" alt="A task's comment thread with a comment that mentions Alex, a reply nested under it, and a newer comment."></picture>

- **Mention** someone by typing `@` and picking their name. They get a notification.
- **Reply** to a comment to keep a conversation together. The comment box shows who you're replying to, with a button to cancel and post a new comment instead. Replies are nested under the comment.
- **Edit** or **Delete** your own comments; deleting asks you to confirm. Edited comments are marked as edited. Project admins and the owner can delete any comment. On a computer these actions appear when you point at a comment or move to it with the keyboard; on a phone they're always shown.
- Hover over or focus a comment's time ("2 h ago") to see the full date and time in your format.
- Comments support simple formatting: `**bold**`, `*italic*`, `` `code` ``, lists, quotes and links.

Everyone who can see a task can comment on it, viewers included. Rows with comments show a speech bubble and a count. Comments work offline too and are sent when you're back online.

The **Activity** tab shows the task's changes: who created it, completed it or changed its date. See [Activity on a task](trash-and-history.md#activity-on-a-task).

## See what others changed

**Updates** (in the sidebar's **More** group, or <kbd>g</kbd> <kbd>h</kbd>) lists the latest changes in all your shared projects, newest first and grouped by day. Each shared project shows a count of unread changes next to its name, and opening the feed marks them as seen. Filter by project, person or kind of change (completed, created, commented, assigned, rescheduled). Ticks made through a public link show **Public link** as the person, not the member who created the link, also on a task's Activity tab and in a project's activity.

<picture><source srcset="images/activity-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/activity-light.webp" alt="The Activity feed listing recent changes by Sam Rivera and you in the Home renovation project."></picture>

Inside a project, **Activity** in the header's **⋯** menu (<kbd>Shift</kbd>+<kbd>H</kbd>) opens the changes for that project only beside the list.

## Things to know

- **Labels and reminders stay personal.** Labels you add to a shared task are only visible to you, and so are your reminders.
- **Moving a task out of a shared project** to your own project or Inbox makes a copy there and removes the original from the shared project for everyone.
- **Deleting a shared project** is something only the owner can do. It disappears for every member, and its open tasks are copied into the owner's Inbox.
- **End-to-end encryption and sharing don't mix.** Shared projects are never encrypted, and an account with [encryption](e2ee.md) turned on can't share new projects.
