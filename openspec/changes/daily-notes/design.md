# Design

## Context

Standalone notes (`standalone-notes`) are ordinary synced entities with random ids. `internal/ids.NameID` (and `web/src/lib/ids.ts`) derive deterministic ids, used today so that concurrent completions of one recurring occurrence converge. Preferences live in the `user_prefs` row "me" of the author's personal scope. `note-templates` adds templates and placeholders; `notes-in-routines` adds the Note type to routines.

## Goals / Non-Goals

Goals: today's note in one key; the same note for the same day on every device, offline included; no clutter of empty notes; a routine can add to the day's note.

Non-goals: a journal app, weekly or monthly notes, a calendar of notes, the day's tasks inside the note.

## Decisions

### D1. The day is a field, the id is derived

`note.day` (`kString`, default `""`, not content: it is a date the app shows anyway) holds `YYYY-MM-DD`. A daily note's id is `NameID("daily-note", <user id> + ":" + <day>)`. Two devices creating the same day write ops for the same entity: `title`, `day`, `project_id` and `description` converge by last-writer-wins, and the document merges. The server refuses an op that sets `day` on a note whose id is not that name-based id for the op's author and day (a forged day cannot claim another user's id), and the client never changes `day` after creation.

Alternatives considered:
- **A random id and a lookup by day.** Rejected: two offline devices would each create a note for the same day, and the user would see two "12 November" notes after sync.
- **One note per day per workspace.** Rejected for now: the setting's project already places the note; a user who keeps work and home apart picks the project in the workspace they write in most. The id has room for a workspace later (a new namespace) without touching existing notes.

### D2. The template is written once, as text

Creating a daily note writes `title`, `day`, `project_id`, `labels` (the template's) and the filled template as `description` only, with an empty `notes_doc`. The document is then built by the existing fold-back of plain-text writes (`rich-text-editing` "Plain-text writes fold back into the document") on the device that opens it. Two devices that create the same day write the same `description` (same template, same day, same placeholders), so last-writer-wins picks equal text and the fold-back builds one document; the text is never doubled, as it would be if both inserted it into the mergeable document. When the user types before the first sync, the typed text is a document edit after the fold-back and merges like any edit.

### D3. A draft until the first keystroke

Opening a day without a note shows the filled template in the editor as a draft held in memory. The first keystroke (or a paste, a checkbox tick, a formatting command) writes the note as in D2 and then applies the edit. Leaving the draft untouched writes nothing. So browsing days, pressing `g j` on a day you write nothing, or a reload creates no notes.

### D4. Which day is today

Today is the user's local date after the day start (`date-time-preferences`). `g j` at 01:30 for a user whose day starts at 04:00 opens yesterday's note.

### D5. Where it is opened

- `g j` (the free go key; `j` for journal) from anywhere, registered as `go.dailyNote`, global scope, shown only while the setting is on.
- The command palette: "Open today's note".
- The Notes sidebar (`notes-space`): a **Today's note** row under All notes.
- Today's header: an icon button (note icon, tooltip "Today's note") among the header actions.

All four are hidden while the setting is off.

### D6. The routine step

**Get the daily note** takes a date (Date, the run's day by default) and outputs that day's Note for the run-as user. When the note does not exist it is created as in D2 from the user's settings; the creation is planned like Create note, so a run that fails later writes nothing. The step is available only while the user's Daily notes setting is on (reason `daily_notes_off`). It is a content step on an encrypted account (the title and template text are content), so it runs on a device there.

### Interface budget

No new row of chrome: Today gets one icon button in its existing header, the Notes sidebar gets one row inside the Notes space (not a primary destination), the day arrows sit in the note's existing header. No new scroll region. Shortcuts: `g j` is free in the registry; `[` and `]` are already registered in other scopes, so the new ones are registered in the daily-note scope only, where neither is used, and the registry's conflict test covers them.

## Data model

Additive fields declared in `internal/sync/ops.go` `Schema` with comments: `note.day` (string, `""`), `user_prefs.daily_notes` (bool, false), `user_prefs.daily_notes_project` (string, `""`), `user_prefs.daily_notes_template` (string, `""` meaning the built-in Daily; `"none"` for no template; otherwise a template note's id). A client reads an unknown template id as the built-in Daily and keeps the stored value. No rename, no migration.

## Size and memory

Under 1 KB gzip on the first load (the go key's handler and the Today button); the rest is in the Notes and Settings chunks. No dependency. Server memory unchanged; the id check is one hash per op that sets `day`.

## Risks / Trade-offs

- The setting's project changes after notes exist: older daily notes keep their project, new ones go to the new project. The id does not depend on the project, so the day still maps to one note.
- A user who deletes a day's note and creates it again gets the same id; restoring from the Trash and creating anew are therefore the same note. Creating a day whose note is in the Trash restores it instead of creating a new one.
