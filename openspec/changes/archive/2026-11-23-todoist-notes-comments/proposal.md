# Todoist notes become comments

## Why

#1723: a Todoist backup's notes (comments) land in the task's description under "Comments", as one flat list without who wrote them or when. People switching from Todoist expect them in the task's comment thread, where OpenTodo shows comments.

## What Changes

- Each `note` row of a Todoist CSV (a single project file or the backup ZIP) becomes a comment on the task right above it, authored by the importing account, in the file's order.
- The comment's body starts with the original author and time, `**Pete** · 2023-11-01 16:08 UTC`, then a blank line and the note. The author comes from `AUTHOR` without its trailing account id (`Pete (14148749)` is Pete); the time from `DATE`, an ISO 8601 instant, written in UTC. Without an author or a readable date that part is left out; without both the comment is the note alone.
- The task's description no longer gets a "Comments" block for these notes.
- One import creates at most 5,000 comments. A note past that, or one too long for a comment body (64 KB), goes into the description under "Comments" as before, and the preview carries one note saying how many and why.
- An import's comments do not count against the per-account comment limit (60 a minute): the per-import cap bounds them instead. Device and REST writes are limited as before.
- Undo removes the comments the import created; importing the same backup again adds none (its tasks are skipped as already imported, and so are their comments).

Not **BREAKING**: no new op field, entity, route or environment variable.

**Out of scope:**
- The Todoist API import (`json-items`, comments in the notes), Trello and every other foreign format: their comments stay in the description.
- The own export: its comments stay not imported (import-completeness D3 is unchanged there).
- Reactions, mentions and threads: Todoist's CSV has none.

ROADMAP.md item advanced: none. This refines the shipped `data-import` capability.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `data-import`: "Todoist structure" turns note rows into comments; a new requirement "Todoist notes as comments" says how.

## Impact

- **Code:** `internal/importer` (`profile_todoist.go` reads notes into `Row.Comments`; `plan_comments.go` plans them, with `MaxComments` in `importer.go`; `service.go` applies with `sync.WithoutCommentLimit` and undoes comments) and `internal/sync` (`WithoutCommentLimit` in `comments.go`, read in `apply.go`).
- **Data model, op log, sync:** none new. Comments are ordinary `comment` entities written as ops with device `import`, in the task's scope, authored by the importing account, so every rule of `comments` "Authorship and permissions" holds. They sync to every device and converge like any comment.
- **Encrypted accounts:** a comment body is a content field; like every imported text it is stored in plaintext until an unlocked device encrypts it again, as the import screen already says.
