---
title: Archived projects
summary: Archiving hides a finished project without deleting it. When OpenTodo offers to archive, automatic archiving after 30 days, and how to bring a project back.
audience: user
section: Guides
specs: [trash-and-history]
screens: [settings/projects#bring-back-an-archived-project]
order: 132
---
# Archived projects

<picture><source srcset="images/archived-projects-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/archived-projects-light.webp" alt="The bottom of the Projects page with Archived projects open: the archived projects, each with a Restore button."></picture>

Archiving is different from deleting. An archived project disappears from the sidebar, but it isn't in the Trash and isn't deleted after 30 days: it and its tasks are kept as they are. Archive a project from its **Project** menu.

When you complete the last task of a project, OpenTodo offers to archive it. The [weekly review](review-and-statistics.md#the-seven-steps) walks every project, with an **Archive** key. Projects without open tasks for 30 days are archived automatically, with a notice that has an undo button. To switch automatic archiving off on a device, untick the option under **Settings → Data**. A pinned project leaves [Favourites](projects.md#all-projects-and-favourites) while it is archived and comes back with it.

## Bring back an archived project

Open the **Projects** page (**All** next to **Projects** in the sidebar, or <kbd>g</kbd> then <kbd>Shift</kbd>+<kbd>P</kbd>) and open **Archived projects** at the bottom; its heading shows how many there are. **Show archived projects** in **Settings → Data** opens it straight there. You see every archived project, sorted by name, with its parent project and how many open tasks it has. Select **Restore** next to one, and it's back in the sidebar with all its tasks. With the keyboard, <kbd>Tab</kbd> to the button and press <kbd>Enter</kbd>.

- Restoring works offline, like any change, and the project comes back on your other devices after they sync.
- Restoring brings back that one project. If you archived a project with sub-projects, they stay in the list until you restore each of them.
- A project you restore by hand isn't archived automatically again on that device.
- In a shared project, only the owner or an admin can restore it, the same people who can archive it.

Deleted projects are a different matter: they go to the [Trash](trash-and-history.md#restore-something-from-the-trash).
