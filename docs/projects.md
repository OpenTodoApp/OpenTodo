---
title: Projects and sub-projects
summary: Create projects and nest them, use the Project menu to colour, move, rename, archive or delete, duplicate a project or a task, and what happens when a project is done.
audience: user
section: Guides
specs: [project-organization]
screens: [project#organise-with-projects]
order: 17
---
# Projects and sub-projects

<picture><source srcset="images/project-list-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/project-list-light.webp" alt="The Home renovation project with its tasks grouped under the sections Planning and In progress."></picture>

Projects keep related tasks together, and projects can sit inside other projects.

## Organise with projects

To create a project, click **+** next to **Projects** in the sidebar, type a name and choose **Create**. Pick a parent project in the same form to make it a sub-project.

The **Project** menu at the top right of a project lets you:

- pick a **colour** from the swatches at the top,
- **Move to…** another project, or back to the top level. Type to find the target: each candidate shows the projects it sits in, and the project itself and its sub-projects are never offered. <kbd>m</kbd> opens the menu straight at this step, and <kbd>Esc</kbd> goes back to the menu.
- **Rename** it,
- **Archive…** it, which hides it and its sub-projects from the sidebar while keeping every task,
- **Delete project…**, which moves it to the Trash.

Archive and delete ask first and say what they affect, for example how many open tasks and sub-projects move with the project.

<picture><source srcset="images/project-move-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/project-move-light.webp" alt="The Move to step of the project menu: a search field above the possible targets, Top level first, each project shown with the projects it sits in."></picture>

The number next to each project in the sidebar counts its open tasks. When a project with sub-projects is folded, the number includes them.

Inside a project you can also group tasks into sections and show them as a board. That has its own guide: [Sections and boards](sections-and-boards.md).

## Sub-projects

Sub-projects work like folders: "Work" can hold "Q4 launch", which can hold more. A project's page lists its sub-projects at the bottom with their task counts. Use the small arrow next to a project in the sidebar, or <kbd>←</kbd> / <kbd>→</kbd>, to fold and unfold it. Folding is remembered on each device separately.

## Duplicate a project or task

**Duplicate…** in a project's menu makes a copy: same name with "copy" added (change it if you like), same sections, sub-projects and open tasks with their subtasks, in the same order. Choose a parent project and, optionally, a **Start on** day to move every due date by the same number of days so the earliest one lands on it. Completed tasks, comments, reminders and assignees aren't copied. You can duplicate any project you can see, including a shared one where you're a viewer: the copy is yours alone.

To duplicate one task with its open subtasks, select it and press <kbd>Shift</kbd>+<kbd>D</kbd>, or choose **Duplicate** in the task panel's **⋯** menu. The copy appears right below the original and is selected. A copy works offline and reaches your other devices with the next sync. To reuse a project later, save it as a [template](import-export.md#templates).

## When a project is done

When you complete the last open task of a project, OpenTodo offers to archive it; press <kbd>Enter</kbd> to accept or any other key to keep it. Projects that have had no open tasks for 30 days are archived automatically, with a notice you can undo. You can turn that off in **Settings → Data** (each device has its own setting). To bring an archived project back, open **Settings → Data** and select **Restore** next to it under **Archived projects**; see [Trash and history](trash-and-history.md#bring-back-an-archived-project).
