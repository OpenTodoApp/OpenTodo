---
title: Sync protocol
summary: Operations, the schema, the winner rule, the exchange, sharing scopes, live updates, purge and history.
audience: developer
section: Internals
specs: [offline-first-sync, activity-log]
screens: []
order: 20
---
# Sync protocol

OpenTodo syncs with a field-level, last-writer-wins operation log. It is a state-based CRDT (a map of LWW registers), which gives three properties:

- **Convergence**: replicas that have seen the same ops hold the same state, in any order.
- **Idempotency**: applying an op twice changes nothing.
- **Offline safety**: ops can be produced without the server and merged later.

## Operation

```json
{
  "id": "0d1f…",                 // unique per op (UUID v4)
  "entity": "task",              // "task" | "project" | "label" | "view" | "reminder" | "section" | "field" | "comment" | "attachment" | "project_prefs" | "user_prefs" | "review"
  "entityId": "8c2a…",           // UUID of the entity
  "field": "title",              // must be in the schema for the entity
  "value": "Buy oat milk",       // JSON, type-checked per field
  "ts": 1760060000123,           // hybrid logical clock, unix ms
  "device": "3c54…",             // id of the producing device ("server:<boot id>" for the server's own writes)
  "actor": "a1b2…"               // served ops only: the author's account id (ignored on input)
}
```

`entityId` is 1 to 64 characters from ASCII letters, digits and `. _ : @ + = ~ -` (UUIDs, `me`, CalDAV UIDs). A batch with any other id is refused with 400 `invalid_op` and nothing in it is applied.

### Schema (v1)

| Entity | Field | Type |
| --- | --- | --- |
| project | `name`, `color` | string |
| project | `position`, `created_at` | number |
| project | `archived` | boolean |
| project | `parent_id` | string or null |
| project | `deleted_at` | number or null |
| project | `description` | string: the project's note as Markdown, the projection of `notes_doc` (OpenSpec `project-notes`) |
| project | `notes_doc` | document: the project's note as a mergeable document, like the task field below |
| task | `title`, `description` | string |
| task | `project_id`, `parent_id` | string or null |
| task | `priority` | integer 1–4 (1 highest) |
| task | `due` | `{"date":"YYYY-MM-DD","time":"HH:MM"?,"tz":"Area/City"?}` or null; the date must exist and the time be 00:00–23:59; `tz` (a known IANA zone, at most 64 characters) only together with `time`, see [Zoned due values](#zoned-due-values) |
| task | `labels` | array of strings (label ids, see below) |
| task | `position`, `created_at` | number |
| task | `completed_at`, `deleted_at` | number or null |
| task | `completed_by` | string (account id) or null: who completed the task, written in the same batch as `completed_at` (the signed-in account when completing, null when reopening); null when unknown. Meaningful only while `completed_at` is set. Server-side completions (REST, assistant tools, CalDAV) add it when the batch does not; public link ticks write null (completed-date-filters) |
| task | `estimate_minutes` | integer 1–10080 (minutes) or null; with `due.time` it forms a calendar block (time-blocking) |
| task | `deadline` | `"YYYY-MM-DD"` (a date that exists, no time or zone) or null; the day the task must be finished by, separate from the planned `due` (deadlines) |
| task | `start` | null (anytime), `"someday"` (parked) or `"YYYY-MM-DD"`, the day before which the task is deferred (someday-and-evening) |
| task | `evening` | boolean, default false: listed under This Evening in Today (someday-and-evening) |
| task | `blocked_by` | array of at most 50 distinct task ids, default `[]`: the tasks this one waits for, in its own sharing scope; never its own id (task-dependencies, see [Dependencies](#dependencies)) |
| task | `recurrence` | recurrence rule string (at most 200 characters, must parse under [the grammar](recurrence.md)) or null |
| task | `series_id` | string (task id) or null |
| task | `assignee_id` | string (account id) or null; checked against the task's scope at receipt (see "Assignment" under [Sharing scopes](#sharing-scopes)) |
| task | `section_id` | string (section id) or null; see [Sections](#sections) |
| task | `ical_extra` | string or null: opaque iCalendar lines from CalDAV clients, see [CalDAV](#caldav) |
| task | `notes_doc` | document: `""` or an envelope `"<format>:v<n>:<base64>"` of at most 256 KB (262,144 characters); the note as a mergeable rich-text document, see [Mergeable documents](#mergeable-documents) |
| task | `habit` | boolean, default false: the series is tracked as a habit, with streaks and a month history derived on the device (habits, see [Habits](recurrence.md#habits)). Not content, so never encrypted |
| task | `skipped` | boolean, default false: on an occurrence record of a habit, the occurrence was skipped rather than done; such a record is not a completion (habits) |
| task | `origin` | null or `{"kind":"url"\|"email"\|"issue"\|"import","provider"?,"id"?,"url"?,"title"?}`: where the task came from (task-origin). `url` kind needs `url`, the others `id`; `provider` 1–32 of `a-z0-9-`; `url` `http(s)` with a host, at most 2,048 bytes; `id` at most 512, `title` at most 500 characters; unknown members refused. One last-writer-wins value like `due`, so concurrent origins never mix. A content field: an encrypted account sends one ciphertext string instead of the object |
| task | `fields.<id>` | a custom field value: null, a string, a finite number or a boolean; objects and arrays are refused. `<id>` is a field definition id of 1–64 characters `[A-Za-z0-9_-]`. One op per field, so values converge key by key; see [Custom fields](#custom-fields) |
| section | `name` | string |
| section | `project_id` | string (project id, required; never changes) |
| section | `position`, `created_at` | number |
| section | `deleted_at` | number or null |
| field | `name`, `options` | string: a custom field definition's name and, for a choice field, its options one per line |
| field | `type` | string: `text`, `number`, `date`, `choice`, `link` or `checkbox`; never changes (custom-fields) |
| field | `project_id` | string (project id, required; never changes) |
| field | `position`, `created_at` | number |
| field | `deleted_at` | number or null |
| label | `name`, `color` | string |
| label | `position`, `created_at` | number |
| label | `deleted_at` | number or null |
| view | `name`, `query`, `color` | string |
| view | `kind`, `group_by`, `sort_by`, `sort_dir` | string (enumeration, see "Saved views") |
| view | `pinned` | boolean |
| view | `panels` | array of strings (view ids) |
| view | `on_drop` | null or an on-drop rule object (see "Saved views") |
| view | `position`, `created_at` | number |
| view | `deleted_at` | number or null |
| reminder | `task_id` | string (task id, required) |
| reminder | `kind` | `"relative"`, `"absolute"` or `"deadline"` (fires at 09:00 local on the task's deadline plus the offset) |
| reminder | `offset_minutes` | integer −525600…525600 (minutes from the due time, or from 09:00 on the deadline for `deadline`; negative = before) or null |
| reminder | `fire_at` | positive number (Unix ms, the resolved firing instant) or null |
| reminder | `delivered_at`, `dismissed_at` | number or null |
| reminder | `created_at` | number |
| reminder | `deleted_at` | number or null |
| comment | `task_id`, `author_id` | string (task id, account id; required, fixed at creation) |
| comment | `parent_id` | string (comment id) or null |
| comment | `body` | string (markdown, at most 64 KB like every value) |
| comment | `mentions` | array of strings (account ids; filtered to members at receipt) |
| comment | `created_at` | number |
| comment | `edited_at`, `deleted_at` | number or null |
| comment | `guest_name` | string or null: the name a guest typed on a [task page](task-pages.md) (content: encrypted for an encrypted account) |
| comment | `page_id` | string or null: the task page a guest's reply came through |
| attachment | `task_id`, `author_id` | string (task id, account id; required, fixed at creation) |
| attachment | `comment_id` | string (a comment of the same task by the same author) or null; fixed |
| attachment | `name` | string, 1–255 characters without `/` or `\` (the author may rename) |
| attachment | `mime`, `sha256` | string (media type; hex digest of the stored bytes, `""` for links); fixed |
| attachment | `size` | whole number of stored bytes (0 for links); fixed |
| attachment | `url` | `http`/`https` URL for a link attachment, or null; fixed |
| attachment | `encrypted` | boolean: the stored bytes are an encrypted envelope; fixed |
| attachment | `created_at` | number; fixed |
| attachment | `uploaded_at` | number or null; written only by the server once it stored the bytes |
| attachment | `deleted_at` | number or null |
| time_entry | `task_id`, `user_id` | non-empty id string; fixed at creation (`user_id` is the author), see [Time entries](#time-entries) |
| time_entry | `started_at` | positive number (Unix ms) |
| time_entry | `ended_at` | positive number (Unix ms) or null while the entry runs |
| time_entry | `device_id` | string: the device that started or logged it (`server` for the REST API) |
| time_entry | `note` | string (user-written; encrypted for an encrypted account) |
| time_entry | `created_at` | number |
| time_entry | `deleted_at` | number or null |
| project_prefs | `feed_seen_at` | number (Unix ms: the activity-feed "seen until" time; personal scope only) |
| project_prefs | `reviewed_at` | number (Unix ms: when this user last marked the project reviewed in the weekly review's project walk) |
| user_prefs | `date_format` | string: `"system"`, `"day-month"`, `"month-day"` or `"iso"` (personal scope only) |
| user_prefs | `time_format` | string: `"system"`, `"12h"` or `"24h"` |
| user_prefs | `week_start` | string: `"system"`, `"mon"`, `"sun"` or `"sat"` |
| user_prefs | `day_start` | string: `"HH:MM"` from `"00:00"` to `"06:00"`, when a new day begins for this person (empty, malformed or out of range reads as `"00:00"`, midnight, and is kept as stored) |
| user_prefs | `language` | string: `"system"` or a shipped interface language (`"en"`, `"de"`, `"fr"`, `"es"`, `"it"`, `"pt"`) |
| user_prefs | `method_mode` | string: `"lists"`, `"companion"` or `"first"` (How you work; unknown or empty reads as `"lists"`) |
| user_prefs | `favourites` | string: an ordered, comma-separated list of `kind:id` entries (`project:<id>`, `label:<id>`, `view:<id>`), the sidebar's Favourites group; entries of an unknown kind or for a missing, archived or deleted item are ignored and kept |
| review | `completed_at` | number (Unix ms: when the last weekly review was finished; personal scope only) |
| review | `daily_at`, `monthly_at` | number (Unix ms: the last Daily check and Monthly look) |
| review | `focus_date`, `focus` | string: the local date (`YYYY-MM-DD`) today's focus was chosen on, and up to three comma-separated task ids |
| review | `closed_at` | number (Unix ms: the latest Close the day; 0 = never) |
| review | `tomorrow_note` | string: the one-line note for tomorrow written at that close (content: ciphertext for an encrypted account) |

`actor` on served ops (OpenSpec `comments-and-activity`) is the account that wrote the op, taken from `ops.user_id`, which the server always sets from the authenticated submitter; a value sent by a client is ignored. It is additive and optional: older clients ignore it, and ops from an older server simply lack it.

Adding fields is backwards compatible. Renaming or removing is not; it needs an OpenSpec change with a migration plan.

A client that receives an op for an entity it does not know (an older build talking to a newer server) ignores it without failing the batch; the cursor still advances.

### Zoned due values

`due` is floating by default: a calendar date and optional wall-clock time that mean the same day and clock time wherever the task is viewed. A due with a `tz` key is *zoned* (OpenSpec change `absolute-datetimes`): `{"date":"2026-10-11","time":"09:00","tz":"Europe/Berlin"}` denotes the instant 09:00 in Berlin on that day. The zone lives inside the value, not in a separate field, so the whole due is one last-writer-wins register: a concurrent floating edit and zoned edit converge on one complete value, never a date from one and a zone from the other.

- The server accepts `tz` only with `time` and only as a zone name it knows (Go's embedded zone database); otherwise the op is rejected like any invalid value. It stores the raw JSON, so servers that predate `tz` also store and serve it untouched, and clients that predate it read `date` and `time` and keep `tz` unless the user edits the due.
- The value is wall time plus zone, not an epoch: it is resolved with the zone's rules in force on that date, so it follows daylight-saving changes and future rule updates. A wall time inside a spring-forward gap resolves to the first valid instant after the gap (02:30 on a 02:00→03:00 day is 03:00); one inside an autumn overlap resolves to its first occurrence. `internal/zoned` (Go) and `web/src/lib/dates.ts` implement the same rules and run the shared vectors in `web/src/lib/zoned.vectors.json`.
- Clients show, sort and group a zoned due by its date and time converted to the viewer's zone (Today, Upcoming, saved views, filters and the calendar grid all use the converted value) and show the original wall time and zone as a hint when the viewer is in another zone. Clearing the time of a zoned due drops `tz`.
- Recurring series keep `time` and `tz` as `date` rolls forward; relative reminders fire relative to the zoned instant.

### Recurring tasks

`task.recurrence` holds a rule such as `every last weekday`; the server rejects an op whose value does not parse (any spelling the grammar accepts is valid, clients store the canonical form). Completing a recurring task is not a single `completed_at` op: the client writes, in one batch, a new *occurrence record* (a task with the series' fields, `completed_at` set, `recurrence: null` and `series_id` pointing at the series) and a `due` op on the series moving it to the next occurrence. The record's id is not random: it is `NameID("occurrence", seriesId + ":" + occurrenceDate)` (SHA-256, formatted as a version 8 UUID; `internal/ids` and `web/src/lib/ids.ts`), and the next due date is a pure function of the rule and dates every device shares. Two devices that complete the same occurrence offline therefore write the same entity and the same `due` value, and LWW only chooses between identical values; Completed shows one entry. "This occurrence only" uses `seriesId + ":detach:" + date` so a copy never collides with a completion. See [recurrence.md](recurrence.md).

### Reminders

A `reminder` belongs to one task (`task_id`) and fires at `fire_at`, always a resolved instant (OpenSpec change `reminders`). An *absolute* reminder keeps the moment the user picked. A *relative* reminder also stores `offset_minutes` and its `fire_at` is the task's due time plus the offset, a date-only due counting as 09:00 in the computing device's time zone and a zoned due counting as its own instant; with no due date `fire_at` is null and it does not fire. The device that changes a task's `due` (an edit, a reschedule, a recurring series completing, skipping or detaching) writes a `fire_at` op for every live relative reminder of the task **in the same batch, with the same timestamp and device** as the `due` op, so LWW always takes the due date and the firing times from the same edit. When the firing moves it also clears `delivered_at` and `dismissed_at`. REST `PATCH /api/v1/tasks/{id}` that changes `due` does the same server-side, in the owner's last reported zone offset (the `tzOffset` field of the sync request) or UTC until one was reported; a zoned due uses its own zone.

- *Snooze* writes a new `fire_at` and clears `delivered_at` and `dismissed_at`; *dismiss* writes `dismissed_at`. Both are ordinary ops, so they queue offline and converge per field.
- `delivered_at` is written by the server (device `server`) when it pushed the reminder. A delivery or dismissal **older than `fire_at`** belongs to an earlier firing and does not count, so a snooze or due change racing the server's delivery op still fires again.
- A reminder is shown when `fire_at` ≤ now, it is not deleted, not dismissed for the current firing, and its task exists and is neither completed nor deleted.
- Reminders are **personal**: every reminder op is stored in its author's personal scope (`user:<id>`), also when the task is in a shared project, so only the author's devices receive it and any member, viewers included, can keep reminders on a shared task. Because another member's device cannot write them, a device that pulls a `due` change for a task in a shared project recomputes its own relative reminders for that task (new ops, not the same batch). A REST due change recomputes only the caller's reminders.
- Push subscriptions are device state on the server (`push_subscriptions`), never ops, and are not exported.

### Mergeable documents

A task's note, and a project's note (OpenSpec `project-notes`), is rich text that merges instead of overwriting (OpenSpec `collaborative-rich-text`). Two fields carry it on both entities:

- `notes_doc` holds the note as a **full-state document**: `""` (no document yet) or `"ydoc:v1:" + base64(Yjs update, format v1)`. It is an ordinary last-writer-wins register on the server and in every device's store; the server validates only the envelope shape (`^[a-z][a-z0-9]{0,15}:v[0-9]{1,3}:` followed by standard or URL-safe base64, padding optional, at most `MaxDocBytes` = 256 KB characters, every other kind keeps 64 KB) and never decodes it. Any envelope format passes, so an end-to-end encrypted value (`enc:v1:…`, see below) is valid too.
- `description` stays the **Markdown projection** of the document: `#` headings, `**bold**`, `_italic_` (`*italic*` inside words), `~~strike~~`, `` `code` ``, `[text](url)`, `-` and `1.` lists, `- [ ]` / `- [x]` check items; a single newline is a line break, a blank line separates blocks. Clients write it in the **same batch** (same `ts`) as `notes_doc`, so the REST API, the export, CalDAV, MCP, webhooks, search and older clients keep reading text.

Rules, all on the client (`web/src/lib/ops.ts`, `web/src/lib/richtext.ts`):

1. **Merge and republish.** A device that applies a `notes_doc` op merges it with its local document whether the op wins or loses (Yjs merges are commutative, associative and idempotent). If the union holds anything the stored winner lacks (an insertion, a format change or a deletion), the device publishes the union and its projection as a new pair with a timestamp newer than the winner; otherwise it publishes nothing. Merging identical states produces no op, and two devices republishing at once both publish the union, so the exchange stops after at most one extra round per device.
2. **Local writes stay pairs.** Every local batch that writes `notes_doc` merges it with the stored document first (a remote change that arrived while the editor held an older copy is never undone) and sets `description` to the projection. A local plain-text write to `description` of a task that has a document (history restore, plain-text fallback) is folded in (rule 3) in the same batch.
3. **Fold-back of plain-text writes.** When `description` has a clock newer than `notes_doc` and no `notes_doc` carries that clock (REST, an older client, CalDAV, email), the text is parsed as Markdown into a new body of the document named after that clock, and the older bodies' content is deleted. The new body is written by a Yjs client id derived from its name into an empty fragment, so every device that folds the same write produces identical structures and the copies merge into one. A concurrent rich edit made before that plain-text write is overridden once (last-writer-wins for that transition). The fold runs when a device opens the note, or before any republish; an older plain-text write loses to a newer document by the ordinary winner rule, and an unpaired projection that differs from the document is re-projected.
4. **Legacy notes.** A task without a document is upgraded lazily when its note is first opened (the same fold, keyed by the `description` clock). No bulk migration.

Document layout: root XML fragments `b:<ts 15 digits>:<device>`, the greatest name is the visible body (`b:000000000000000:` for a note first written in the editor). Text blocks hold one text node whose formatting attributes are marks (`strong`, `em`, `strike`, `code`: `{}`; `link`: `{href}`); elements are `paragraph`, `heading{level}`, `bullet_list`, `ordered_list{order}`, `list_item{checked}`. Unknown elements, attributes and marks from newer clients survive every merge and are shown as plain text. A value a device cannot read (corrupt, another format) is never overwritten automatically; the note then shows `description`.

The editor saves a debounced full state (400 ms after the last keystroke, and on blur, close, hide and unload). The outbox keeps one pending `notes_doc` op per task: a newer state replaces the queued one. A batch whose document would exceed 256 KB, or whose projection would exceed the 64 KB value cap, is refused on the device before any op exists. History, activity and webhook deliveries leave `notes_doc` out; the `description` change in the same change set is the readable revision.

### Comments

A `comment` is a threaded markdown note on a task (OpenSpec `comments-and-activity`). It is an ordinary entity, so comments are written offline, queue in the outbox and converge per field; the body is one LWW register like `description` (two offline edits of one comment keep the newer body).

- **Guests.** A reply through a [task page](task-pages.md) is a comment by the page's publisher from the device `page:<page-id>`, with `guest_name` and `page_id` set. `page:` is reserved like `public:`: `/api/v1/sync` refuses it from devices. On an encrypted page the server keeps the reply as ciphertext; the publisher's device imports it as an ordinary comment whose id is derived from the reply's id, so two devices importing at once converge on one comment.
- **Scope.** A comment lives in the scope of its task: the shared project's scope, or the author's personal scope for a task in the Inbox or an unshared project. A comment created in the same batch as its task follows that task's `project_id` like a new task does. Sharing a project later relabels its tasks' comments with them; purging a task purges its comments (and leaves markers for them).
- **Authorship, checked per op at receipt.** On the op that creates a comment, `author_id` must equal the submitting account; `task_id` and `author_id` can never change afterwards. `body`, `mentions`, `edited_at`, `parent_id` and `created_at` are accepted only from the author. `deleted_at` is accepted from the author, a project admin and the owner. A violation is refused with reason `forbidden` and the server's value travels back in `ops`, like any refused field. A comment on a task the author cannot read, or on a task that does not exist, is refused; ops for a comment whose task was purged are discarded as duplicates.
- **Viewers may comment.** Commenting is the one write a viewer of a shared project is expected to make, so a viewer may create comments and edit or delete their own. This is the only exception to "viewers write nothing".
- **Mentions.** The server keeps only ids of current members of the task's shared project (none on a personal task), without duplicates, and stores the op with the filtered value. The filtered op goes back to the author's device in the same response with the original `(ts, device)`; the client adopts a server value that carries the clock its row already has for this field only (`comment.mentions`), so every device converges on the filtered list. Each account newly added to a comment's mentions gets an in-app notification (`kind: "mentioned"`) after commit, through the same notification sink as assignments.
- **Rate limit.** Each account may create 60 comments per minute (fixed window, sync and REST together); further creations are refused with reason `rate_limited` and are not stored.
- **Delete** sets `deleted_at`; clients show a "comment deleted" placeholder in its place in the thread and the REST API stops serving it. A delete and a concurrent edit resolve per field: the comment stays deleted, whatever body won.
- **Threads** are derived from `parent_id`: a reply to a reply belongs to the same thread, a reply whose parent is unknown, on another task or part of a cycle starts its own thread. `sync.ThreadOrder` and `web/src/lib/comments.ts` implement the same order.
- **Reseeding after a restore** re-sends only the device user's own comments (the server would refuse anyone else's).

### Time entries

A `time_entry` is one stretch of work on a task (OpenSpec `time-tracking`, see [the guide](time-tracking.md)). It is an ordinary entity: entries are written offline, queue in the outbox and converge per field, so an edit of the end on one device and of the note on another both survive. Two devices tracking the same task write two rows and never conflict.

- **Scope.** An entry lives in the scope of its task, like a comment; sharing a project relabels its tasks' entries with them, and purging a task purges every entry on it, other members' included, with markers (`timeEntries` in the purge counts). Ops for an entry whose task was purged are discarded.
- **Authorship, checked per op at receipt.** `user_id` must equal the submitting account on the op that creates the entry; `task_id` and `user_id` never change. `started_at`, `ended_at`, `note`, `device_id` and `created_at` are accepted only from the author; `deleted_at` from the author, a project admin and the owner. Unlike comments, a viewer cannot create entries (tracking is work on the task). A refused op travels back with the stored value (`restore`).
- **One running entry per user.** Starting an entry writes `ended_at` = the new start on the user's running entry in the same batch. When a device holds two or more running entries of its user after a sync (two devices started offline), it keeps the one with the greatest `started_at` (ties: the greatest id) and writes `ended_at` = that start on the others. Every device computes the same values, so the repair converges without a prompt. The server applies the same rule (`internal/timetrack`, shared with `web/src/lib/time.ts` by fixtures) when it starts or stops an entry for the REST API, and never repairs on the sync path. Completing a task on a device ends its running entry in the completion batch; server-side completions do not.
- **Days.** An entry belongs whole to the logical day its start falls on (the user's day start applies); totals are computed on demand from the rows, never stored.
- **Reseeding after a restore** re-sends only the device user's own entries.

### Attachments

An `attachment` is the metadata of a file or a link on a task or one of its comments (OpenSpec `attachments`). The bytes are never in the log: each file is stored once, immutably, under `<data>/attachments/` and moved with its own routes (see [API](api.md#attachments)).

- **Scope and authorship** follow comments: an attachment lives in its task's scope; creating it needs a task the author can read (viewers included) and `author_id` equal to the submitter; a `comment_id` must name a comment of the same task by the same author. Every field except `name`, `uploaded_at` and `deleted_at` is fixed at creation. `name` is the author's alone; `deleted_at` is accepted from the author, a project admin and the owner.
- **Upload.** A device writes the metadata first (it exists offline and syncs in the ordinary batch) and uploads the bytes after the batch is stored. The server verifies size and digest against the metadata, then writes `uploaded_at` itself with device `server`, so every device learns that the file is available through the normal sync. `uploaded_at` from any other device is refused, and `server` is a reserved device id on `/api/v1/sync`, like `agent:` and `caldav:`.
- **Size limit.** A creation whose `size` is over the per-file limit set by the owner is refused with reason `too_large`, so an oversized row never reaches other devices.
- **Lifecycle.** Purging a task purges its attachments and their files. A removed attachment keeps its file for the Trash retention period (so a removal can be undone from any device) and is then purged with it. Files with no row, older than seven days, are swept by the retention job.

### Activity

The activity log is derived from ops, never written (design D4). `internal/activity` (server) and `web/src/lib/activity.ts` (client) implement one rule, and both test suites run `internal/activity/testdata/activity_fixture.json`:

1. Only task, project and comment ops count.
2. Ops are ordered by `(ts, device)`, ties in `seq` order: the order the winner rule resolves them in.
3. An op's old value is the previous value of its field in that order.
4. Ops by one actor on one entity within 5 s of the first op of that actor's open group for the entity fold into one event.
5. An event is classified by the fields it touched, in this order: `created_at` → created; `completed_at` → completed / reopened; `deleted_at` → deleted / restored; `due` → rescheduled; `assignee_id` → assigned / unassigned; `project_id` → moved; `archived` → archived / unarchived; anything else → edited. A comment group is commented (creation), comment_deleted or comment_edited. A group that changed nothing is dropped.

The event id is the id of its first op. Devices record every task, project and comment op they apply (author, old value from the local row, project) in a local `activity` table and derive events from it, so per-task and per-project activity works offline and shows the device's unsent ops as pending. The table keeps at most 500 events per project, dropping the oldest; `GET /api/v1/{tasks|projects}/{id}/activity` serves the full history from the op log, and clients merge older pages by event id and op ids. A device that receives ops out of timestamp order may fold an event slightly differently from the server; the merge never shows an op twice.

### Project preferences and the activity feed

`project_prefs` (OpenSpec `activity-feed`, design D1) holds one user's personal preferences for a project; its `entityId` is the project id. Its ops always resolve to the **author's personal scope**, also for a shared project, so they sync to the author's own devices and never to other members; any member, viewers included, may write their own. Today it has one field, `feed_seen_at`: the time up to which the user has seen the project's activity, taken from the newest displayed event's `ts` (an op timestamp, not the device clock). A client never writes a value smaller than the one it holds, and LWW on `(ts, device)` keeps the later mark, so two devices converge to the later time. Purging a project purges every member's `project_prefs` for it (with markers, so a stale mark cannot bring it back); sharing a project or leaving it does not touch them.

Unread counts are computed locally: events of a shared project by another actor with `ts` greater than `feed_seen_at`. A device with no `feed_seen_at` for a project uses the time of its first sync after the upgrade (stored per device as `feedBaseline`), so existing history does not show up as unread. `GET /api/v1/activity` serves the cross-project feed from the op log (see [api.md](api.md#activity-feed)).

### Date and time preferences

`user_prefs` (OpenSpec `date-time-preferences`, design D1) holds one user's date format, time format and first day of the week. Every client writes it with the `entityId` `"me"`; like labels and reminders it resolves to the **author's personal scope**, so each account's `"me"` row is separate, syncs to that account's devices only, and is never shared with project members. Values are enumerations carried as strings: a client reads an unknown value (from a newer client) as `"system"` without rewriting it, so new values stay additive, and an absent row means `"system"` for all three. Concurrent edits converge per field by LWW on `(ts, device)`. The row has no REST collection, derives no activity, and is included in the JSON export as `user_prefs`; importing an own export into an account without preferences restores them. The values are not user-written content, so they stay in plaintext for an encrypted account. The row also carries the interface `language` (OpenSpec `app-localization`, design D1): `"system"` follows the browser, a language code picks the catalog every device of the account loads; a code this client does not ship reads as `"system"`. The service worker reads the same row to write reminder notifications in that language. The day start `day_start` (OpenSpec `day-boundary`, design D1) is read on each device as a rule for which calendar day is "today" and which day an instant belongs to; applying it writes nothing, so devices converge as before, and the weekly digest reads it from the same row.

### Weekly review

`review` (OpenSpec `stats-and-review`, design D4) records when the user last finished a weekly review. Like `user_prefs` it is one row with the `entityId` `"me"` in the **author's personal scope**: it syncs to the account's own devices only, two finishes converge by LWW on `(ts, device)` so the later one wins, and an offline finish waits in the outbox. An older server rejects its ops as unknown; the device keeps its local value. The row has no REST collection, derives no activity, holds no user-written content apart from `tomorrow_note` (below), and is included in the JSON export as `review`; importing an own export restores it. Statistics themselves are never synced or stored: they are computed on the device from the task rows (see [statistics.md](statistics.md)). The Open Loops rhythms (OpenSpec `open-loops-method`, design D5) add `daily_at`, `monthly_at`, `focus_date` and `focus` to the same row, each its own LWW register, so a Daily check on the phone never overwrites a weekly finish on the laptop. Close the day (OpenSpec `close-the-day`, design D5) adds `closed_at` and `tomorrow_note`, again one LWW register each, so two offline closes can keep one device's time and the other's note; `tomorrow_note` is the row's only content field and is encrypted like a title for an encrypted account, everything else on the row stays plaintext. The per-project review stamp is `project_prefs.reviewed_at`: personal like the feed's seen marker, so a member's review of a shared project never marks it reviewed for the others; it is exported as `project_prefs` and restored by an own-export import.

### Task labels

`task.labels` is an array of **label ids**, not names. Renaming or recolouring a label is therefore one op on the label and never touches a task. Ids that point at a deleted label, or at a label this device has not received yet, are kept in the array but not displayed; the chip appears as soon as the label arrives.

The array is a single LWW register: every write replaces the whole value, and when two devices write different arrays for the same task offline, every replica ends with the array that carries the greater `(ts, device)`. Concretely, if device A adds `errand` and device B adds `call` to the same task while both are offline, only one of the two labels survives on every device. To keep the common case safe the client reads the task's current array in the same transaction as the write, so sequential edits on one device never lose a label, and remote ops are applied live so the window is only the offline period. Deleting a label removes its id from every carrying task with one op per task; a concurrent array write elsewhere can resurrect the id, which is why deleted ids are hidden rather than trusted to be absent. Merging a label rewrites each carrying task's array once (source id → target id, de-duplicated) and tombstones the source.

The path to per-element semantics is recorded in `openspec/changes/archive/2026-10-10-labels/design.md`: an add-wins set encoded as additional per-element fields would be additive to this schema.

### Sections

A `section` is a named, ordered container inside one project (OpenSpec change `board-view`): a heading in the list view and a column on the board. The board itself has no synced state; it is a rendering of sections and tasks. View mode (list or board) and collapsed headings are per-device preferences in the client's local `meta` table and never become ops.

- **Scope.** A section lives in the sharing scope of its project, like a task: a new section's `project_id` in the batch decides its scope, sharing a project relabels its sections into the project scope, and a `project_id` op that would move a section to another scope is refused with `scope_change`. Editors, admins and the owner may write sections; viewers are refused with `forbidden`. Clients never change a section's project (the REST API refuses it).
- **Task reference.** `task.section_id` names a section of the task's project. A reference to a deleted section, a section of another project, or one the device has not received yet is shown as "No section" and is never repaired by a write: a repair would depend on arrival order and could overwrite a newer move. Only user actions write: changing a task's `project_id` writes `section_id: null` in the same batch, and deleting a section writes its tombstone plus `section_id: null` for each of its open tasks, one op each, in one batch.
- **Moves.** Moving a task to a column writes `section_id` and `position` (after the target column's last open task) in one batch with one timestamp, so concurrent moves resolve to the newer one for both fields together. Placement inside a column follows [Manual order](#manual-order).
- **Unknown entities.** Clients skip ops for entities they do not know (an installed, not yet refreshed PWA receiving `section` ops), so future entities never break an older shell; a resync re-delivers them.
- **Purge.** Sections are not Trash items; purging a project purges its sections (live or deleted) with it.

### Custom fields

A `field` is a typed custom field definition of one project (OpenSpec change `custom-fields`): a name, a type, the options of a choice field, a position. A task holds its values as the family of op fields `fields.<id>`, one per definition id, so each value is its own last-writer-wins register: two devices editing different fields of one task offline both keep their edit, and the same field edited twice resolves by `(ts, device)` for that field alone. `null` clears a value.

- **Scope and roles.** A definition lives in the sharing scope of its project like a section (sharing relabels it, a `project_id` op into another scope is refused with `scope_change`). Editors, admins and the owner may write definitions; viewers are refused with `forbidden`. Values are task fields and follow the task's role rule.
- **Validation.** The server checks only the shape of a value (`null`, a string within the value limit, a finite number or a boolean) and never looks the definition up: a value and its definition may arrive in any order, and a value whose definition was deleted is still valid. Type conformance, the 30-definition limit per project and unique names (ignoring case) are checked by clients, the REST API and the assistant tools. Two devices creating the same name offline end with two definitions; both are shown and a filter matches either.
- **Display rule.** A device shows only the live definitions of the task's current project. A value of a deleted definition or of another project stays in the data, is exported, and reappears when the task returns to a project that defines it; no display rule ever writes. A value that no longer fits its definition's type is shown as text with a note until the next edit.
- **Client fold.** Clients keep the values as a `fields` map on the task row (`applyOps` folds `fields.<id>` into it, with the clock under the op field name) and write a partial map that becomes one op per key. The REST API, the export and webhook deliveries present the same map as a `fields` object.
- **Occurrence records** of a recurring task and detached copies carry every `fields.<id>` of the series, on the device and on the server alike, so both write the same record.
- **Purge.** Definitions are not Trash items; purging a project purges its definitions with it.

### Manual order

Tasks (per project section, per parent's subtasks, and in the Inbox), sections and sidebar projects (per parent) are ordered by hand through their existing `position` number (OpenSpec change `manual-ordering`). Nothing about the op format changes; this is the rule every client applies to that field.

- **Order rule.** A list sorts by `(position, id)` ascending. The id tie-break makes the order total and identical on every device, also when two items end up with the same position after concurrent inserts into one gap. Subtask and sidebar trees use the same rule for siblings. Date and filter views keep their own sort and use `(position, id)` only as the last tie-breaker.
- **Insertion.** A move writes the midpoint between its new neighbours, or `first − 1000` / `last + 1000` at an edge: one `position` op. New tasks get their creation time, or `largest position + 1000` when something was moved past it, so they land at the end.
- **Renumbering.** When the neighbours are equal or too close for a distinct double between them (about twenty bisections of one gap), the client renumbers the smallest window of neighbours around the gap with even spacing, growing it outwards until the values fit (at worst the whole list; an open end uses spacing 1000), and places the moved item in it. Each renumbered item is an ordinary `position` op in the same batch as the move, so the batch shares one timestamp and converges like any other edit. Items the user may not write (a shared project where they are not owner or admin) are never rewritten; they bound the window.
- **Cross-container moves.** Dropping a task into another section or under another parent writes `section_id` / `parent_id` and `position` in one batch with one timestamp; a project dropped into another project writes `parent_id` and `position` together. Under LWW the newer move wins both fields, so an item never ends up with one device's container and the other's position.
- **Concurrency.** Same op set → same order; no item is lost or duplicated because order is derived from rows. Intent is not preserved: two devices placing different items into the same gap interleave by position then id, and a renumbering on one device concurrent with a move on another can shift where the other move appears. One more move fixes either; a sequence CRDT per list could be added later without changing the transport.
- **Roles.** Viewers write no positions. A project's `position` is a project field: only its owner or an admin may move a shared project in the sidebar, while editors reorder its tasks and sections.

### Saved views

A `view` is a saved filter query with its presentation options (OpenSpec `custom-views`). It is the first synced entity that holds a preference rather than task content, and it follows the same per-field LWW rules: changing the grouping on one device and the sort on another, both offline, leaves every device with both changes.

- `query` is the query string exactly as typed, in the grammar of `docs/filters.md`, never a parsed form. Each client parses it when the view is shown; a query a client cannot parse (for example a term added by a newer version) shows the parse error and no results instead of wrong results.
- `kind` is `list` or `dashboard`; `group_by` is `project`, `due`, `priority`, `label` or `none`; `sort_by` is `due`, `priority`, `position`, `created` or `title`; `sort_dir` is `asc` or `desc`. On the wire these are plain strings so a future value is additive. The op schema accepts any string; a client that meets a value it does not know shows the default (`list`, `project`, `due`, `asc`) without rewriting the field, so the newer device keeps its choice. Only the REST API rejects unknown values, because REST requests are sequential and safe to refuse.
- `panels` holds the ordered view ids shown by a dashboard (empty for lists). Like `task.labels` it is a single LWW register: two devices editing the panel list offline end with the newer list. A panel whose view is missing or deleted is shown as a placeholder; clients refuse to add a dashboard as a panel.
- `on_drop` (OpenSpec `rule-boards`) is a list view's on-drop rule: `null` or an object of at most one choice per kind, `add_labels` / `remove_labels` (up to 32 label ids each), `priority` 1–4, `due` `today` / `tomorrow` / `next-week` / `clear`, `start` `someday` / `clear`, `section` `{project_id, section_id | null}` and `state` `complete` / `reopen`. The op schema checks this shape (unknown keys are refused; a new key is a server-first schema addition) but never that the ids exist. It is one LWW register, like `panels`: two devices setting a rule offline end with the newer rule, whole. Older clients keep the field in the row and ignore it, and their edits of other fields leave it alone. A rule acts only when a device drops a card on a board column showing the view: that device turns it into ordinary task field ops (its logical today resolves the dates), so nothing is evaluated on the server. Which card a board keeps showing after a drop is device state, never synced. Not a content field: it holds ids and enumerations only.
- The start view (the view a device opens on launch) is **not** synced: it lives in the device's `meta` table under `startView`, like the collapsed projects.

### Encrypted values

For an account with [end-to-end encryption](e2ee.md), the content fields of its personal scope — task `title`, `description`, `ical_extra`, `notes_doc` and every string value `fields.<id>` (text, link, date and choice; numbers and booleans stay plaintext); project, label and section `name`; a custom field definition's `name` and `options`; view `name` and `query`; comment `body` — carry ciphertext: a string `"enc:v1:" + base64url(nonce(12) || AES-256-GCM ciphertext || tag(16))` whose additional authenticated data is `entity + "\0" + entityId + "\0" + field`. The protocol, the schema, the value types and limits are unchanged: the server validates the envelope as an ordinary string and never decrypts it, and last-writer-wins picks winners by `(ts, device)` exactly as for plaintext (two encryptions of the same text differ, which is irrelevant because values are never compared). Devices encrypt at upload and decrypt before applying; a value that does not authenticate for its location (wrong key, tampering, or moved to another entity or field) is kept as the winning op but shown as a placeholder. Shared project scopes are never encrypted. Plaintext content that reaches an encrypted account (REST, email, import) is re-written as ciphertext by the next unlocked device that applies it; once ciphertext wins, nothing is re-written again. `POST /api/v1/encryption/purge-history` deletes superseded ops of the content fields in the personal scope; winners stay, so convergence and cursors are unaffected.

## Winner rule

For a given `(entity, entityId, field)`, an incoming op replaces the stored value when

```
op.ts > cur.ts  OR  (op.ts == cur.ts AND op.device > cur.device)
```

The same comparison runs in Go (`internal/sync.Wins`) and TypeScript (`web/src/lib/hlc.ts`).

## Clocks

Each device stamps ops with `max(Date.now() + offset, last + 1)`, so its own timestamps are strictly increasing even if the system clock jumps back. After every exchange the client compares `serverTime` with its clock: it adopts the difference as `offset` when the skew is over two seconds and sets `offset` back to zero when it is not, and a `last` (also the seed persisted on the device) more than five minutes ahead of `serverTime` is brought back to `serverTime`.

An op stamped more than five minutes ahead of the server's clock (`sync.MaxFutureSkewMs`) is not stored as it is (OpenSpec `sync-convergence`):

- A device that sends `"features": ["clock_skew", …]` gets it refused in `rejected` with reason `clock_skew` and the server's clock as `serverTime`. It is not a verdict on the value, so no server value is sent back: the device corrects its clock, restarts `last` from `serverTime`, stamps the refused ops again (ops that shared a timestamp share the new one, the row's clock follows) and re-sends them with the same ids in the next round of the same exchange. Every device then orders the edit by the corrected time, so a device whose clock ran fast cannot freeze a field.
- Older clients, which do not send the feature, would drop an op refused for a reason they do not know, so for them the server clamps `ts` to five minutes ahead of its clock, as before. Such a device keeps its own (unclamped) timestamp locally; upgrading the app ends that.

Server-side writers (REST, assistant tools, CalDAV, public links, push delivery records, imports, email, unassignments) take their timestamps from one strictly increasing clock per server process (`Service.ServerTS`) and write as device `server:<boot id>`, a suffix chosen at start, so two server writes to one field never tie on (`ts`, `device`). Ops stored by older releases carry the bare `server`; both forms are the server's (reserved on `/api/v1/sync`, trusted for `uploaded_at`, shown as "API" in history, reported as source `server` to webhooks).

## Exchange

`POST /api/v1/sync`

```json
{ "device": "3c54…", "cursor": 140, "ops": [ …pending ops… ],
  "features": ["clock_skew", "backfill_ack"], "backfillAck": 0 }
```

`features` (optional, additive) names the protocol additions the device handles: `clock_skew` (see [Clocks](#clocks)) and `backfill_ack` (see "Catch-up for a new member" under [Sharing scopes](#sharing-scopes)). `backfillAck` echoes the `backfillSeq` of the last replay page the device applied.

Response:

```json
{
  "applied": 3, "duplicates": 0,
  "ops": [ …ops with seq > 140 not authored by this device… ],
  "cursor": 158, "hasMore": false, "serverTime": 1760060001000,
  "generation": "4f1c0a9e2b7d4c55a1e0f3b2c8d9e7f6",
  "rejected": [ { "id": "op-17", "reason": "forbidden" } ],
  "memberships": [ { "projectId": "…", "role": "editor", "ownerId": "…",
                     "members": [ { "userId": "…", "name": "Alice", "email": "…", "role": "owner" } ] } ],
  "purged": [ { "entity": "task", "entityId": "…" } ],
  "trashRetentionDays": 30
}
```

`rejected` and `memberships` are additive (see [Sharing scopes](#sharing-scopes)); so are `purged` and `trashRetentionDays` (see [Purge](#purge)), and `backfillSeq`, present only on a replay page served to a device that sent `backfill_ack`. Older clients ignore them.

Client loop (`web/src/lib/sync.ts`):

1. Read up to 500 ops from the outbox and the stored cursor.
2. Send; on success delete those outbox rows, apply the returned ops with the winner rule, store the new cursor.
3. Repeat while `hasMore` or the outbox is not empty.

Before storing the cursor the client compares `generation` with the one it stored; see [Log generation](#log-generation).

Triggers: 250 ms after a local edit, on `online`, when the tab becomes visible, on a live wake-up (below), on every (re)connection of the live channel, periodically (every 30 s, relaxed to 5 min while live updates are connected), and manually from the status pill.

Robustness (OpenSpec change `client-sync-robustness`):

- **Deadlines.** Every request has a timeout (`web/src/lib/http.ts`: 30 s, 10 min for file and archive transfers). A timeout or a network failure shows *offline* and retries with jittered backoff (1 s doubling to 30 s); any other failure, including a bug in the client, shows *error*.
- **One tab syncs.** The tab holding the Web Lock `opentodo-sync` runs the loop, the timer and the live channel; other tabs post `{type: "sync"}` on the `opentodo-sync` BroadcastChannel and show the status the leader broadcasts. When the leader stops or closes, the lock passes to another tab. Without Web Locks every tab syncs on its own.
- **Sign-out.** `stopSync()` starts a new local data epoch and aborts the request in flight; the running exchange checks the epoch after every await and stops before its next write. Sign-out waits for it, tells the other tabs (they reload), and clears the local data while holding the lock.

Server (`internal/sync.Apply`): validate the whole batch, then in one transaction resolve each op's scope, refuse the ones the author may not write (reported in `rejected`), `INSERT OR IGNORE` the others into `ops` (duplicate ids are counted, not re-applied) with their scope in `op_scopes`, and upsert `scope_fields` under the winner rule. `Pull` returns ops after the cursor from every scope the caller can see in `seq` order, skipping the caller's own device but still advancing the cursor past them.

### Paging

A pull page holds at most 1000 ops **and** at most about 4 MB of op values (`sync.MaxPullBytes`, the summed length of the `value`s it serves; ops of the caller's own device are skipped and do not count). The page ends before the op that would cross the budget, `cursor` is the `seq` of the last op served and `hasMore` is `true`; the device simply asks again. A page always carries at least one op, so a single value larger than the budget still travels (alone) and the device always makes progress. The history replay for a newly joined shared project (below) is paged by the same two limits. Purge markers on a partial page are reported up to the page's last op, as before. The rule is additive: the response format is unchanged, a page is only cut earlier, and a client that loops on `hasMore` (the web app does) needs no change. The budget is an internal constant, not a setting.

## Sharing scopes

Every op and every materialized field belongs to one scope (OpenSpec `project-sharing`): `user:<userId>` holds a user's Inbox, unshared projects, labels and saved views; `project:<projectId>` holds a shared project and its tasks. `ops.user_id` is the op's author. Because `seq` is one global sequence, a device keeps a single cursor across all the scopes it can see, and the request format is unchanged.

- **Which scope an op belongs to.** A project op goes to the project's scope once it is shared, otherwise to the author's personal scope. A task op goes to the scope the task already lives in; a new task goes to the scope of the `project_id` sent in the same batch (no project = Inbox = personal). Labels and views are always personal.
- **A task never changes scope.** A `project_id` that would move a task into another scope is refused with reason `scope_change`. Clients move across scopes by copying the task (new id) into the destination and tombstoning the original; deleting a shared project tombstones the project and its tasks and the owner's device copies the open tasks into the owner's Inbox.
- **First share.** Sharing a project relabels the project and its tasks (with their sections, custom field definitions, comments and attachments) from the owner's personal scope to the project scope in one transaction. It is refused with 409 `project_id_conflict` when another account's personal scope holds a project with the same id. Only the scope label changes; `seq`, op ids and content stay, so the owner's devices keep their cursor.
- **Authorization at receipt.** Each op is checked against the author's membership when the server receives it, never against `op.ts`: viewer → nothing (except comments, see [Comments](#comments)); editor → tasks; admin → tasks and project fields except `deleted_at`; owner → everything; non-members → nothing. A refused op is not stored and is listed in `rejected` with its id and reason (`forbidden`, `scope_change` or `not_a_member`) in a 200 response; the rest of the batch is applied. The response's `ops` also carry the current winning op of every refused field the caller can see, so the device drops its local change and shows the server's value without another round trip. Resending an already refused op gives the same answer.
- **Catch-up for a new member.** A device whose cursor is past part of a project's history when its user joins receives that history first: pages of the project's ops up to the device's cursor at its first exchange after joining, with `cursor` unchanged and `hasMore: true`, then the regular pull. Progress is kept per device (`member_backfills`), so each of the member's devices replays the history once. A device that sends the `backfill_ack` feature gets each replay page with a `backfillSeq` and echoes it as `backfillAck` in its next exchange, once it applied the page; progress advances only on that echo, so a page lost in transit is served again (OpenSpec `sync-convergence`). For older clients progress advances when the page is served, and a page lost in transit is not resent; re-syncing from cursor 0 recovers it.
- **Membership** lives outside the op log (`project_members`) and changes only through the REST routes, so offline devices cannot race on it. Every exchange returns the caller's `memberships`; a device purges a project (and its tasks) that it knew as shared and that is no longer listed. A membership change wakes the affected devices with an event that carries no cursor (`data: {}`), so they always run the exchange.
- **Assignment** (OpenSpec `task-assignment`). A non-null `task.assignee_id` must name a current member of the task's shared project, or the author for a task in a personal scope; otherwise the op is refused with reason `not_a_member` (plus the server's value in `ops`, as for `forbidden`). Viewers are refused with `forbidden` like any other write. When a member leaves or is removed, or their account is deleted, the server writes `assignee_id: null` ops (device `server:<boot id>`, author = whoever removed them, or the project's owner for a deleted account) for every task of that project assigned to them, in the same transaction as the membership change and stamped later than the value they replace, so every device converges on "unassigned" without client logic. An assignment to someone other than its author that wins on the server emits an internal assignment event after commit (`internal/notify`), which becomes an in-app notification (`GET /api/v1/notifications`).
- **Older clients** keep syncing their personal data unchanged. They drop refused ops from the outbox like any acknowledged op but only show the server's value once a newer value arrives.

## Live updates

Polling alone would leave a change made on one device invisible on another for up to 30 s. The server therefore offers a wake-up channel: an authenticated server-sent event stream per device.

`GET /api/v1/sync/events?device=3c54…` (same session cookie or bearer token as every other route; `device` is required, 400 `bad_request` without it)

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
X-Accel-Buffering: no

: connected

event: ops
data: {"cursor":158}

: ping
```

- **Payload.** An `ops` event carries only the user's latest `seq`. It never contains op values, field names or entity ids, so the stream is safe to log and proxy. Data still travels exclusively through the exchange above: on an `ops` event the client compares the cursor with its stored one and runs an exchange only when it is newer. A lost event is harmless.
- **Exclusion.** The server wakes every subscription of the user except the one whose `device` equals the device that pushed the ops, so a device never re-syncs because of its own push. REST writes are stamped `device: "server"` and wake every device.
- **Heartbeat.** An idle stream writes a comment line `: ping` every 25 s, below the idle timeouts of common reverse proxies. On every heartbeat the server re-validates the session or token; a revoked one ends the stream within one interval, and the next connection attempt gets 401.
- **Limits.** At most 10 concurrent streams per account; opening one more closes the oldest instead of refusing the new one, so a device reconnecting after a half-closed connection is never locked out. Beyond that, one client address holds at most 20 streams and the server at most 2,000; a stream over either cap is refused with 503 `busy` and `Retry-After`, and the client retries through its backoff while polling keeps it in sync. Open streams are closed on graceful shutdown so clients reconnect to the new process.
- **Client lifecycle** (`web/src/lib/sync.ts`): `startSync()` opens an `EventSource` after sign-in, `stopSync()` closes it. On `open` the client syncs once to cover anything missed and marks `live: true` in the status snapshot; on `error` it closes the source and reconnects with jittered exponential backoff (1 s base, 30 s cap). No connection is attempted while offline; the `online` event starts one.
- **Fallback.** Periodic polling continues: every 30 s while the channel is disconnected, every 5 min while it is connected. A client that never opens the stream keeps working exactly as before.

Implementation: `internal/sync.Notifier` is an in-memory, per-user subscriber set with a one-slot channel per stream (a slow reader coalesces wake-ups into the newest cursor and never blocks `Apply`); the sync handler and the REST write-through call `Notify` after a committed `Apply`. One process is the deployment contract, so there is no cross-process fan-out.

## Log generation

The cursor scheme assumes the server's log only grows. A [restore from a backup](backups.md#restore) breaks that: the server goes back to the moment of the backup, its `seq` numbers restart below what devices have seen, and it no longer knows edits made after the backup, although the devices still hold them. The **log generation** makes this visible.

- The server keeps a random 128-bit `generation` in its `settings` table. It is created once with the database and replaced with a new random value by every `opentodo restore`. Every `POST /api/v1/sync` response carries it (an additive field: clients that ignore it keep working, they just do not re-seed).
- The client stores the value in its `meta` table. The first value a device sees is adopted. A different value on any later exchange means the server was restored.
- On a mismatch the client, in one IndexedDB transaction, re-emits **every field of every local row** (projects, tasks, labels, saved views, tombstones included) as a new op `{id: <new uuid>, entity, entityId, field, value, ts: <stored ts>, device: <stored device>}` taken from the row's per-field clock, adds them to the outbox (in chunks of 1,000), sets `cursor = 0` and stores the new generation. Ops already waiting in the outbox stay. The normal loop then uploads the outbox in batches and pulls the whole log from zero. The status pill shows **Re-syncing after restore…** meanwhile.
- **Convergence.** The re-emitted ops carry the clocks the device already stored, not the current time, so the server ends up with exactly the state the device had, and the winner rule decides between devices as usual: an edit made after the backup (newer `ts`) beats the restored value, an older local value loses to a newer one from another device, and two devices re-seeding concurrently converge on the value with the greatest `(ts, device)` everywhere. Fresh op ids keep the server from discarding them as duplicates; unchanged entity ids mean nothing is duplicated. A stale device cannot overwrite newer data, which is why the timestamps are not bumped to now.
- **Offline devices** re-seed on their next successful exchange, however long after the restore.
- **Cost.** A re-seed sends one op per stored field: about 11 per task, so 5,000 tasks are roughly 55,000 ops, a few seconds on a Raspberry Pi, once per device per restore. The server clamps far-future timestamps as always; re-emitted timestamps were already clamped when first stored.

## Deletes

Deletion sets `deleted_at`. Lists filter tombstones out; export includes them. Because a tombstone is just another field under LWW, a delete made on one device wins over older edits from another and the entity never reappears. Restoring from the Trash writes `deleted_at: null`; between a delete and a restore made concurrently, the op with the greater timestamp wins.

Deleting a project writes only the project's tombstone (plus moving its direct sub-projects to its parent). Its tasks keep `project_id` and clients hide every task whose project is deleted, so restoring the project is one op and brings the tasks back exactly as they were. Deleting a shared project additionally tombstones its tasks and copies the owner's open tasks into the owner's Inbox (project-sharing).

## Purge

Purge is the one operation that removes data from the log, and it is not an op (an op would live in the log it removes). An authenticated request (`DELETE /api/v1/{tasks|projects}/{id}/purge`, `POST /api/v1/trash/purge`, or the server's retention job) deletes the entity's rows from `ops`, `op_scopes` and `scope_fields` and inserts a marker into `purges` (`scope_id`, `entity`, `entity_id`, `seq`). Only entities whose `deleted_at` is set can be purged. Purging a project purges every task, section and custom field definition that references it in the same scope; purging a task purges its deleted descendants; reminders of purged tasks (every member's), their comments and their attachments (with the files, after commit) are purged too, and so are every member's `project_prefs` of a purged project.

Three rules keep replicas convergent:

1. **Markers share the op sequence.** A marker's `seq` is reserved from the same AUTOINCREMENT sequence as ops, so `Pull` reports markers with `seq > cursor` (and, on a partial page, `seq <=` the page's last op) in `purged`, and the returned cursor moves past them. Ops and markers are read in one snapshot. Clients delete the listed rows locally, together with any outbox ops for them.
2. **Late ops are discarded.** `Apply` drops ops for an entity that has a marker in a scope the author can see and counts them as `duplicates`; a device that edited the entity offline therefore cannot recreate a partial copy. Markers are kept indefinitely (a few dozen bytes each).
3. **Purge is requested online only.** The client never deletes locally before the server confirms; offline, the Trash marks the item as pending and nothing is lost if the request fails.

Everyone who can see the purged entity's scope receives the marker and is woken over the live channel. Older clients ignore `purged`; the entity stays tombstoned (invisible) on them.

**Retention.** At startup and every 24 hours the server purges tasks, projects and removed attachments whose `deleted_at` is older than `OPENTODO_TRASH_RETENTION_DAYS` (default 30; `0` disables automatic purge), through the same path. The value is reported as `trashRetentionDays` so the Trash can show remaining days. A database restored from a backup is consistent with itself: markers and the log live in the same database.

## History

`GET /api/v1/{tasks|projects}/{id}/history` reads the entity's ops from the scopes the caller can see, ordered by `(ts, device)` and grouped into change sets of one timestamp and device. An op that arrived after a newer write to the same field is marked `lost`. Restoring an earlier value from the history writes a new op with the current clock, so history stays append-only and the restore converges like any edit.

## Trees: subtasks

`task.parent_id` encodes a tree in an LWW register, so two devices can move tasks concurrently. The tree is **derived** from the current field values; no repair op is ever written, which keeps the result independent of arrival order.

- **Cascades are per-task ops.** Completing a parent writes `completed_at` on every open descendant; deleting a parent writes `deleted_at` on every descendant; moving a parent to another project writes `project_id` on every descendant. Each is a normal op, so a concurrent edit on one descendant still resolves field by field (a rename of a deleted subtask survives in the export, the tombstone stays). Reopening a parent does not cascade.
- **Inconsistent parents render at the top level.** A subtask whose parent is missing locally, deleted, completed (while the child is open) or in another project is shown at the top level of its project with a breadcrumb when the parent is known. When the parent's ops arrive or it is reopened, the child nests again.
- **Cycle breaking.** If moves on two devices produce a cycle (`X` under `Y` and `Y` under `X`), every client breaks it identically: among the members of the cycle, the task whose `parent_id` has the newest clock under the winner rule (`ts`, then `device`, then id as a last resort) is treated as a root. The user sees it at the top level and can move it again. The REST API additionally rejects a `parent_id` that would close a cycle or cross projects (`400 invalid_input`), because REST requests are sequential against current state; sync batches are never rejected for tree reasons.

The implementation lives in `web/src/lib/tree.ts` (generic `buildTree`, `descendants`, `isDescendant`, cycle breaking) and `web/src/lib/subtasks.ts` (progress and display state).

## Dependencies

`task.blocked_by` lists the tasks a task waits for. It is one register, like `labels`: the whole list is replaced, and two devices editing it offline end with the newer list. The app rewrites the list from a fresh read in one local transaction, so edits on one device never lose an entry.

- **Blocked is derived.** A task is blocked while at least one task in its list is live and open. A completed, deleted or purged blocker stops blocking, and so does an id the device has not received (it cannot tell "not yet" from "purged"). Nothing is repaired: completing, reopening or deleting a blocker writes nothing on the tasks that wait for it. A recurring task keeps blocking across its completions, because each completion is a separate occurrence record.
- **No cycles in synced state.** The server refuses a `blocked_by` op that would make a task wait for itself, directly or through others (reason `cycle`), against the graph that holds every op accepted before it, in earlier batches and earlier in the same batch. Completed and deleted tasks count, so reopening one never reveals a cycle. When two offline devices each add one half of a cycle, the half that reaches the server first is kept and the other is refused, whatever their clocks: arrival order decides, not the winner rule. The refused device gets the server's current value back (or an empty list) in the same response.
- **One sharing scope.** A blocker must live in the task's scope (both in the same shared project, or both personal). An id of a task the server stores in another scope is refused (reason `not_in_scope`); an id it does not know yet is accepted. Moving a task to a project shared differently copies it without its blockers, and tasks that waited for it stop being blocked, since they now point at a tombstone.
- **Local cycles for a moment.** A device can hold a cycle until the server answers (an edge arrived while the user was choosing). Every device then ignores, inside each cycle, the edges of the member whose `blocked_by` has the newest clock (`ts`, `device`, then id), the rule used for subtree cycles, so no pair blocks each other.

REST answers both refusals with `400 invalid_input` and names the offending id. The implementation lives in `web/src/lib/dependencies.ts` and `internal/sync/dependencies.go`.

## Trees: sub-projects

`project.parent_id` encodes the project tree with the same LWW register and the same derived-tree rules; `web/src/lib/projects.ts` builds it on `tree.ts`.

- **Moves are two ops.** A move writes `parent_id` and a `position` after the new siblings. Two devices moving the same project resolve each field by the winner rule.
- **Cascades are per-project ops.** Archiving writes `archived=true` on every descendant; deleting writes `deleted_at` on the project, `parent_id = <its parent>` on each direct sub-project and `project_id = null` on each of its open tasks. Unarchiving does not cascade. Because each project's `archived` is its own register, a sub-project moved out on one device while its parent is archived on another ends up archived at the top level when the archive op is newer, and open at the top level otherwise, identically everywhere.
- **Missing parents render at the top level.** A project whose parent is not present locally, deleted or archived is shown as a top-level project until the parent appears; nothing is written.
- **Cycle breaking.** Two offline devices can move `X` under `Y` and `Y` under `X`. Every client breaks the cycle identically: the member whose `parent_id` has the newest clock under the winner rule (`ts`, then `device`, then id as a last resort) is displayed at the top level, the others stay nested beneath it, and no repair op is written. The user can move it again with one action. The REST API rejects a `parent_id` that would close a cycle (`400 invalid_input`) because REST requests are sequential against current state; sync batches are never rejected for tree reasons.
- **Collapse state is local.** Which projects are collapsed in the sidebar lives in the device's `meta` table and never enters the op log.

## REST writes

REST handlers translate request bodies into ops stamped with the server clock (`Service.ServerTS`) and the server's device (`server:<boot id>`), then call the same `Apply`. There is exactly one write path.

## CalDAV

Calendar apps (OpenSpec change `caldav`, [caldav.md](caldav.md)) write through the same path: the server turns each `PUT`, `DELETE`, `MKCALENDAR` or `PROPPATCH` into ops with server time and the device id `caldav:<app password id>`, one op per property whose value actually changed, applied with `ApplyStrict` and announced to every device with the usual wake-up. Calendar apps never pull ops; they read the materialized state, and their ETags, CTags and sync tokens are derived from it and from the op cursor (the same `seq` as the exchange, purge markers included).

`task.ical_extra` carries the VTODO lines the app does not model (alarms, `X-` properties, unsupported `RRULE`s). It is one LWW register like any string field: devices store and sync it without interpreting it and never write it themselves, so a title edit on a phone and an alarm change in Thunderbird converge with both changes; two calendar apps changing their preserved properties concurrently end with the later set.

## Limits

- 1000 ops per request, 64 KB per value (256 KB for a document field such as `task.notes_doc`), 4 MB per request body.
- `labels` is replaced as a whole value (see "Task labels" above; set semantics are a future change). The same holds for `view.panels`.
