# Design

## D1. Narrowing import-completeness D3 for Todoist CSV

Design D3 of `import-completeness` keeps comments out of imports for three reasons: `author_id` must be the submitting account, comment creation is limited to 60 a minute per account, and rewriting authorship to the importer would misattribute other people's words. It still holds for the own export. For a Todoist CSV it is narrowed:

- **Authorship.** The comment's `author_id` is the importing account, which is the account submitting the ops, so the server's rule ("an `author_id` equal to the submitting account") is met as for any comment. Nothing is forged and no other account is named.
- **Misattribution.** The words are not passed off as the importer's: the body's first line names the original author and time, `**Pete** · 2023-11-01 16:08 UTC`, before the note. A Todoist backup only names its people by display name and Todoist account id, which mean nothing on this server, so text is the only faithful way to keep them. This is what the description block did, with the author and time added back.
- **Rate limit.** Replaced on the import path by a per-import cap (D3).

The own export keeps D3 as it was: its comments name accounts of the exporting server, which an own-format round trip promises to keep, and a text prefix would change every comment.

## D2. The comment

- `body`: the header line, a blank line, then the note's `CONTENT` unchanged (Todoist notes are Markdown already). The header is the author in bold (Markdown characters escaped) and the time, joined by ` · `. `AUTHOR` loses a trailing ` (digits)`, Todoist's account id. `DATE` is read as RFC 3339 (`2023-11-01T16:08:26.405000Z`, with or without fractions or an offset) and written `YYYY-MM-DD HH:MM UTC`. A missing author leaves only the time; a missing or unreadable date leaves only the author; with neither there is no header and the body is the note alone. No warning: nothing is lost that the file had.
- `task_id`: the task created from the row above; `parent_id` null; `mentions` empty; `edited_at` and `deleted_at` null.
- `created_at`: the import time plus one millisecond per comment already planned, so the thread keeps the file's order (comments sort by `created_at`, then id). The original time is in the header, not here: the comment was posted by the importer at import time.
- A note before any task, or right after a section row, belongs to no task and is skipped, as before.

## D3. Per-import cap instead of the per-minute limit

- `importer.MaxComments = 5000`, next to `MaxRows`. The planner counts the comments it creates across the whole import (every file of a backup). A note past the cap goes into its task's description under "Comments", one `- ` line each, exactly as before this change. A note whose comment would not pass the op schema check, which in practice means a body over `sync.MaxValueBytes` (64 KB, the bound on every op value, comment bodies included), is never folded into the description: the description has the same bound, so the task itself would fail. It is posted without its first line, and when it is too long even alone it is cut at a character boundary to fit and ends in "…". The preview carries one file-level note with the count of notes folded and of comments cut; rows get no warning, so a large backup does not crowd the bounded preview list.
- The import job's apply call carries `sync.WithoutCommentLimit(ctx)`. `newApplyBatch` then installs no comment limiter for that batch, so the import neither uses up nor is refused by the account's 60-a-minute window. A context value can only be set by server code; no HTTP route sets it, so `/api/v1/sync`, the REST comment routes and every other writer stay limited, whatever device id they send. Only the limit is lifted: the authorship and visibility checks of `resolveComment` run unchanged.
- The cap keeps a single job as bounded as the limit kept a client: at most 5,000 comments, each at most 64 KB, inside the import's existing file-size and row limits.

## D4. Ids, re-import and Undo

- Comment ids are new random ids, like the reminders, links and time entries a foreign import creates. They need no source identity: a comment is created only with its task. A task already imported (remembered source id) or skipped as a possible duplicate is skipped with its comments, so importing the same backup again writes nothing. `existing: skip|overwrite` applies to own exports only and does not concern these rows.
- Comments are recorded in `import_items` like every created entity, and Undo tombstones them (`deleted_at`) with the job's other entities.

## Data model impact

None: `comment` and its fields exist; no field is added or renamed. The plan's totals are unchanged (comments count in `entities`).
