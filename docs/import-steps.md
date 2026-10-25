---
title: Import step by step
summary: Choosing a file, checking the preview, the options for projects, time zones and sections, duplicates, undoing an import, and the limits.
audience: user
section: Guides
specs: [data-import]
screens: [import#import-from-another-app]
order: 121
---
# Import step by step

<picture><source srcset="images/import-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/import-light.webp" alt="The Import data screen with a file picker, the format and options, and the list of past imports."></picture>

An import never writes anything until you've seen what it will do, and it can be undone afterwards. The overview is in [Import and export](import-export.md).

## Import from another app

Open **Settings → Data**, select **Import data** (or press <kbd>g</kbd> then <kbd>Shift</kbd>+<kbd>I</kbd>) and choose a file. OpenTodo accepts:

- an **OpenTodo export**, for moving to another server or restoring (the ZIP export brings its attached files too),
- a **CSV file**, from a spreadsheet or a script, with a `title` column and optional columns for project, due date, priority, labels and more,
- **JSON exports from other task apps**, in the common shapes those apps use.

Nothing is written straight away. OpenTodo first shows a preview:

1. **Check the format** it detected. You can change it if it guessed wrong.
2. **Choose the options**: with more than one workspace, the **Workspace** the import goes into (it starts with the one you have open, and the preview names it, such as "12 new projects into Work"; for an OpenTodo export it starts with **As in the export**), which project gets tasks that have none, the time zone for dates, whether sections stay sections or become labels, and what to do with possible duplicates and with rows that have errors.
3. **Read the preview table.** Each row says what will happen: created, updated, skipped (with the reason) or an error (with the reason). Problems are listed first.
4. **Import.** The import runs on the server, and the tasks reach all your devices on their next sync.

Recurring rules, reminders, subtasks, sections and completed tasks come across where the file has them. Anything OpenTodo can't store is listed as a warning on its row, never dropped silently.

## Duplicates

Importing the same file twice won't double your tasks. OpenTodo recognises rows it imported before, and flags tasks that look like ones you already have (same title, project and due date). Those are skipped unless you choose **Import them anyway**.

For an OpenTodo export, items that already exist on the server are kept as they are, unless you choose to overwrite changed fields.

## Undo an import

Every import appears under **Past imports**, with a summary. **Undo** removes everything that import created and leaves the rest alone. Tasks you added later to an imported project move to your Inbox rather than disappearing. You can then import the same file again, for example with different options.

## Good to know

- Import needs a connection to your server.
- Files can be up to 20 MB and 50,000 rows, unless your server allows more.
- Comments aren't imported. The preview tells you how many there were.
- Attachments in a file from another app come across as links when they're web addresses. Anything else, like a file on someone's computer, is listed as a warning.
- Attached files count towards your attachments total, like files you add yourself. A file over the limit is skipped and listed under the import's errors.
- In a CSV file, write dates as `2026-10-15` and put a time like `09:30` in a `due_time` column. The [import reference](import.md#csv-csv) lists every column, with an example file.
- If a JSON export from another app isn't recognised, convert it to CSV. Every field OpenTodo stores can be written as a CSV column.
- A template file is better started with **From a template…** than imported; see [Project templates](templates.md#from-a-template-or-import).

The [import formats reference](import.md) has the details: each format, how fields are mapped, recurring rules and reminders.
