# Proposal

## Why
While writing a note on a phone, the floating plus starts another blank note. It should finish the current note, like the task capture flow's arrow.

## What Changes
- Show an upward arrow named **Done** while a standalone note is open on a phone; activating it returns to Notes and retains the current note.
- Keep the plus for starting a note from Notes, with the title focused for typing; keep existing automatic saving.
- Out of scope: daily notes, desktop controls, task capture, native keyboards and changes to note persistence.

## Capabilities
### New Capabilities
None.
### Modified Capabilities
- `notes-page`: finish an open standalone note from the phone's floating button.

## Impact
Application edits: `Shell.tsx` and `TabBar.tsx` for Done, `NotesPage.tsx` and `NoteEditor.tsx` for new-note title focus, with regression coverage in existing note and tab-bar tests. Reuse existing arrow artwork and translated text. No dependencies, routes, schema fields or environment variables. Refines the shipped `notes-home` roadmap item; no new roadmap initiative.
