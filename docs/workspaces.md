---
title: Workspaces
summary: Keep work and home apart with separate workspaces, each with its own projects, labels, filters and people, and share a project with a whole group in one step.
audience: user
section: Guides
specs: [workspaces, project-sharing, app-shell]
screens: [settings/workspaces]
order: 72
card: settings-workspaces
---
# Workspaces

<picture><source srcset="images/workspace-switcher-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/workspace-switcher-light.webp" alt="The workspace switcher open at the top of the sidebar: Personal and Family with their Inbox and Today counts, New workspace and Manage workspaces."></picture>

A workspace is a separate room with its own projects, labels, filters and people. Keep your job in **Work** and the household in **Family**, and switch between them in one click.

## Your default workspace

Every account starts with one workspace, **Personal**, which holds everything you had before. With a single workspace the top of the sidebar reads **OpenTodo · Personal**, and nothing else changes.

## Switch

Select the workspace name at the top of the sidebar to open the switcher. It lists your workspaces with their Inbox and Today counts. Pick one and every list, count, search and quick add shows that workspace. A dot on the name means another workspace has updates.

Your choice is remembered on each device. From the keyboard, open search with <kbd>Ctrl</kbd>+<kbd>K</kbd> and type **Switch to workspace**. Opening a link or a notification from another workspace switches for you.

## Create a workspace

Choose **New workspace** in the switcher, name it and pick a colour. It needs a connection to your server. New projects, labels and filters, and tasks you add to the Inbox, go into the workspace you are in.

## Members and groups

Open **Settings → Workspaces** and pick a workspace in the list; on a wide screen it opens beside the list, on a phone as its own page. Its tabs:

- **General**: the name, colour and icon, then **Transfer**, **Delete** or **Leave**.
- **Members**: add people by the email of their account on this server and give them the **member** or **admin** role.
- **Groups**: make groups such as **Adults**. Open a group to rename it, add people by searching their name, or remove them. Deleting a group first tells you which projects lose access through it.
- **Invites**: create a link that adds whoever opens it, as a member or (for the owner) an admin, valid for 1 hour, 1 day, 7 days or 30 days.

<picture><source srcset="images/settings-workspaces-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/settings-workspaces-light.webp" alt="Settings, Workspaces: Personal and Family with their roles, and the Family workspace's name and colour."></picture>

Projects stay private until you share them. In a workspace you created, the Share dialog lists its members by name and its groups: share **House** with **Adults** as editor and everyone in the group can edit it. Someone outside the workspace cannot be added to its projects. In your default workspace you share by email, as before.

## Mention a group

In a comment or a task's notes, type `@` and pick a group, such as **Adults**, listed after the people. Everyone in the group who can see the task gets one notification; nobody else is told. See [Comments and activity](comments-and-activity.md#comment-on-a-task).

## Move things

The project menu has **Move to workspace…** for projects you own. Its tasks, sections and sub-projects follow, and labels on its tasks are matched by name in the other workspace. Undo puts everything back. A task in the Inbox moves with the command **Move … to workspace** in search.

## Import into a workspace

**Import data** has a **Workspace** choice, starting with the one you have open: everything the import creates goes there. In the terminal: `ot import todoist.zip --workspace Work`. See [Import formats](import.md#workspace).

## Good to know

- Preferences such as the theme and language are per account, not per workspace.
- A [filter](filters.md#workspaces) such as `workspace: Home | workspace: Work` looks across workspaces.
- With [end-to-end encryption](e2ee.md) you can create workspaces and move things, but not add members, groups or invite links yet.
- An account owns at most 20 workspaces; a workspace has up to 200 members and 50 groups.
- Sharing works as described in [Sharing and comments](sharing.md); labels and filters belong to one workspace each ([Labels and filters](labels-and-filters.md)).
