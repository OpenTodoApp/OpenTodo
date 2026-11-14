# Proposal

## Why

Many people keep one note per day: what happened, what they decided, what to pick up tomorrow. Today that means creating a note by hand each morning, naming it, and finding yesterday's again by search. A daily note should be one key away, always the same note for the same day on every device, and reachable by a routine ("at 18:00, add what I finished today to today's note").

## What Changes

- **One note per day, opt-in.** Settings › Notes › **Daily notes** (off by default) with a project (none by default) and a template (the built-in Daily of `note-templates` by default, any of the user's templates, or none). Stored as additive `user_prefs` fields, synced like the other preferences.
- **The same note everywhere.** A daily note is a standalone note with an additive field `day` (`YYYY-MM-DD`) and a name-based id derived from the user and the day (`internal/ids.NameID`), so two devices that create the same day's note offline create the same note and converge on it. The template text is written as the plain-text projection and folded into the document once, so it is never doubled.
- **Open it.** `g j` (free in the registry), the command palette ("Open today's note"), a **Today's note** row under All notes in the Notes sidebar, and an icon button in Today's header. The day follows the user's day start. Opening a day that has no note shows the template, ready to type; the note is written only when the user types, so browsing days creates nothing.
- **Move between days.** In a daily note, ‹ and › (and `[` and `]` when no text field has focus) open the previous and next day; the title is the date in the user's date format and can be renamed.
- **Routines.** A new step **Get the daily note** (a date, today by default) outputs that day's Note, creating it from the settings when it does not exist yet, so a routine can add to it.

Not **BREAKING**: additive fields only, no route, no environment variable.

Out of scope: weekly or monthly notes; showing the day's tasks or events inside the daily note (links do that); a calendar of daily notes; daily notes in the CLI, REST or MCP beyond what notes already offer (they are notes, so `ot notes`, the notes routes and `get_note` see them); more than one daily note per day.

Builds on `note-templates` (templates and placeholders) and `notes-in-routines` (the Note type). Archive after both.

Roadmap: the "Notes area" in ROADMAP.md.

## Capabilities

### New Capabilities

- `daily-notes`: the setting, the daily note's identity, opening and moving between days.

### Modified Capabilities

- `routines`: the Get the daily note step.
- `keyboard-shortcuts`: `g j` opens today's note; `[` and `]` move between days in a daily note.

## Impact

- Server: `internal/sync/ops.go` (`note.day`; `user_prefs.daily_notes`, `daily_notes_project`, `daily_notes_template`; regenerated schema files); the routine planner's new step; the server refuses a `day` on a note whose id is not the name-based id of its author and day.
- Web: `web/src/lib/dailyNotes.ts` (id, day, the draft before the first keystroke), the setting in Settings › Notes, the Notes sidebar row, Today's header button, the day arrows in the note header, the routine step card; all in lazy chunks except the go key.
- Docs: a new `docs/daily-notes.md`, `docs/notes.md`, `docs/routines.md`, `docs/keyboard.md` (generated).
- Size: under 1 KB gzip on the first load (the go key and the Today button); the rest loads with the Notes chunk.
