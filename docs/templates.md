---
title: Project templates
summary: Start a project from the template library or from a template file, with dates counted from your start day; save your own templates; contribute one to the library.
audience: user
section: Guides
specs: [project-templates]
screens: [templates#save-a-template]
order: 122
---
# Project templates

<picture><source srcset="images/project-list-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/project-list-light.webp" alt="A project with sections and tasks, and the + next to Projects in the sidebar that starts a project from a template."></picture>

A template is a project you want to start again and again: a trip checklist, a client onboarding, a weekly review. It's a small file in the same format as an [export](import-export.md#download-everything).

## Save a template

Open a project's menu and choose **Save as template…**. You get a file with the project, its sub-projects, sections, open tasks and the labels they use, with the dates as they are. Completed tasks, assignees, comments and reminders are left out. On an encrypted account the dialog warns you that the file isn't encrypted.

## Start a project from the library

Select **+** next to **Projects** in the sidebar, then **From a template…** (or **New project from a template** in the command palette). The dialog opens on the template library that comes with OpenTodo: trip planning, moving house, a weekly review and more, grouped by category, in your language where a translation exists. It works offline.

Type to search titles, summaries, labels and tasks; <kbd>↓</kbd> moves to the templates and <kbd>Enter</kbd> opens one. You see its description, how to use it, how to make it yours, and a preview of every section and task with when it falls ("day 3", "week 2"). Nothing is created yet. Choose a **Start on** day (today unless you change it) and an optional parent project, and select **Create**. <kbd>Esc</kbd> goes back to the library, and again closes the dialog.

## Start a project from a file

In the same dialog, **Upload a file…** takes a template file you saved or downloaded. You see what it holds and choose the start day and parent the same way. Dates move together so the template's first day lands on your start day; times stay the same. You can start the same template as often as you like: each time is a new project.

## Templates from the website

The downloads on [open-todo.app/templates](https://open-todo.app/templates) are template files. Open them with **Upload a file…** to get fresh copies counted from your start day.

## Contribute a template

The library lives in the `templates/` folder of the [OpenTodo repository](https://github.com/pixari/opentodo/tree/main/templates): one folder per template, written by hand in a short YAML format, with optional translations. Propose a new one with a pull request; [the format and the bar for the library](https://github.com/pixari/opentodo/blob/main/templates/README.md) are on GitHub. Templates are shared under CC BY 4.0.

## From a template or Import?

**From a template** and **Import** do different things with the same file: Import creates it once, with the ids and dates in the file (importing it again skips everything as existing), while From a template makes a fresh copy on your device, also offline. When you import a template file, the preview points you to From a template. The import itself is described in [Import step by step](import-steps.md).
