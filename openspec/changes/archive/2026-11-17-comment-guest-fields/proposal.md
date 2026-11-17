## Why

A comment's `guest_name` and `page_id` mark it as a guest's reply through a task page. Two writers set them: the server, when it stores a reply to a page it can read (device `page:<page-id>`), and the publisher's device, when it imports a reply to an encrypted page (task-pages D4). Sync applies no rule of its own to them: it treats them like any field the comment's author may write.

## What Changes

- A device may set `guest_name` and `page_id` only on a comment it creates. `page_id` must name a task page of that comment's task that the writer published, and `guest_name` may be set only together with such a page.
- On a stored comment, a device may only repeat their stored values.
- The server's own writers are unchanged.
- `TestAuthoredRulesMatrix` records the change: the 12 rows where a comment's author writes these fields on a stored comment go from `ok` to `forbidden`.

## Capabilities

### Modified Capabilities

- `task-pages`: "Guest replies become comments" says who may write the two fields.

## Impact

- `internal/sync/comments.go`, plus `internal/sync/attachments.go`, which now uses the resolver's existing `storedField` instead of a copy of it.
- No client change: the web app's import already writes a page of the task it imports for.
- After a restore from a backup older than the page, a re-seeded imported reply keeps its text and loses its guest label, because the page is unknown to the restored server.
