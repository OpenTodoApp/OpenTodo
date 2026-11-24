# Proposal

## Why

Microsoft has announced that the To Do apps retire on 30 June 2027 and says it will provide a way to export your data before then, without a date or format yet. The `data-import` requirement "Microsoft To Do structure" makes the switch guide say that the tasks file of an Outlook data export is read when it holds the same objects. Nobody has checked such a file, so the guide cannot promise it. The rewritten guide (pull request #1986) names the PowerShell script as the way out today instead.

## What Changes

- "Microsoft To Do structure": the switch guide names the PowerShell and Microsoft Graph export as the way to get the data out today, and says that once Microsoft publishes its own To Do export, OpenTodo checks it and supports it if it can. The sentence about the Outlook data export file goes.
- No change to the importer, its detection or its mapping; no new op field, route, setting or dependency. Not **BREAKING**.

Out of scope: reading Microsoft's own export, which is a change of its own once the format is known; the importer fixes audited on `import/mstodo-ready`.

Roadmap: no `ROADMAP.md` row; this keeps the spec in step with the switch guide.

## Capabilities

### Modified Capabilities

- `data-import`: "Microsoft To Do structure" says what the guide names as the export.

## Impact

- `docs/switch/microsoft-todo.md` (already rewritten in the same pull request); `changelog.d/Changed/microsoft-todo-export-path.md`.
