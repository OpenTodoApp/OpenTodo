# Proposal

## Why

A screenshot or a file on the clipboard while typing a new task has to wait: today the task is created first, then found and opened, and the file attached in its panel (issue #1951). Links typed or pasted in quick add already become link attachments (quick-add-links); files and images do not.

## What Changes

- **Paste a file into quick add.** In every quick add that creates tasks (a list's line, a section's line, the phone's sheet, the command bar's Add mode, the calendar's add dialog), pasting clipboard data that holds files or images lists them as pending files under the title instead of pasting anything into the field.
- **Saved with the task.** Adding the task writes it and its files as one batch, through the existing attachment path: the same per-file and quota limits and messages, the same offline queue (the bytes wait on the device and upload after sync), encryption for an encrypted account's personal tasks, and one Undo for all of it.
- **Removable before saving.** Each pending file has a remove button; the list is announced to screen readers.
- **Text paste is unchanged**, including a pasted list (paste-to-tasks) and a pasted link (quick-add-links, which already covers links). A pasted list confirmed with pending files gives the files to its first task.
- **Refused clearly.** A file over the server's limit or the quota, a paste while signed out, on a demo instance or with attachments turned off lists nothing, and the field shows the existing message.

Out of scope: dropping files on quick add, a file button in quick add, the capture screen (it lists shared files itself), and the task panel's title (the panel already takes pasted files). Advances the capture work of `ROADMAP.md`.

## Capabilities

### Modified Capabilities

- `natural-language-capture`: a new requirement, "Pasting files into quick add".

## Impact

- `web/src/app/QuickAdd.tsx` (paste handling, pending list), `web/src/app/quickadd/PendingFiles.tsx` (the list, shared with the comment composer), `web/src/lib/attachments.ts` (`checkFiles`, `withFiles`, `commitFiles` with a writer), `web/src/lib/ops.ts` and `web/src/lib/pasteTasks.ts` (`files` on a new task), `web/src/lib/reuseAdd.ts` (a line with files is never a reused item), the message catalogs, tests, the quick add guide.
- No server, sync, op schema or API change. No new dependency.
