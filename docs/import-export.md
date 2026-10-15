---
title: Import and export
summary: Download everything you have as one file, and bring tasks in from a spreadsheet, another OpenTodo server or other task apps.
audience: user
section: Guides
specs: [data-import]
screens: [import#import-from-another-app, settings/data#download-everything]
order: 120
card: import
---
# Import and export

Your tasks are yours. You can download all of them at any time, and bring tasks in from other places. Nothing is locked in.

## Download everything

Open **Settings → Data** and select **Download export (JSON)** in the **Export** row. You get one file with all your projects, sections, tasks and subtasks, labels, reminders and saved views, including completed tasks and items in the Trash. Shared projects you're a member of are included too.

The file is plain JSON, so you can open it in any text editor, keep it as a backup, or load it into another OpenTodo server.

The JSON file lists your [attachments](attachments.md) but doesn't contain the files. To take the files with you, select **Download export with files (ZIP)** instead: you get the same JSON file plus every attached file, in one ZIP. Importing the JSON file alone brings back links and the names of files, but not the files themselves.

The person who runs your server can also set up automatic [backups](backups.md) of the whole server.

## Import from another app

Open **Settings → Data**, select **Import data…** (or press <kbd>g</kbd> then <kbd>Shift</kbd>+<kbd>I</kbd>) and choose a file. OpenTodo accepts:

- an **OpenTodo export**, for moving to another server or restoring (the ZIP export brings its attached files too),
- a **CSV file**, from a spreadsheet or a script, with a `title` column and optional columns for project, due date, priority, labels and more,
- **JSON exports from other task apps**, in the common shapes those apps use.

<picture><source srcset="images/import-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/import-light.webp" alt="The Import data screen with a file picker and the list of past imports."></picture>

Nothing is written straight away. OpenTodo first shows a preview:

1. **Check the format** it detected. You can change it if it guessed wrong.
2. **Choose the options**: which project gets tasks that have none, the time zone for dates, whether sections stay sections or become labels, and what to do with possible duplicates and with rows that have errors.
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

The [import formats reference](import.md) has the details: each format, how fields are mapped, recurring rules and reminders.
