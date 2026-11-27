# Design

## Context
See proposal.md. `Shell.tsx` sends every Notes floating-button click to `create: true`; `TabBar.tsx` always draws a plus. Notes are already created before their editor opens.

## Goals / Non-Goals
Change the existing phone button's meaning while a standalone note is open. Keep automatic saving and avoid new draft tracking, editor callbacks or save APIs.

## Decisions
Derive the finish state from the Notes route's standalone-note id and pass it to AddButton for its arrow and translated Done label. Route activation back to Notes, following the editor's existing Back action. Apply to reopened standalone notes too: both use the same editor and already exist in local storage. Daily notes remain outside scope.

On phones, request title focus once when New note creates a blank note, extending the existing one-time body-focus request. Consume it when the form mounts; the title's autofocus opens the keyboard where supported. Search-created and daily notes retain body focus, and ordinary reopening does not request title focus.

Reuse blur/unmount saving in `NoteEditor.tsx` and `NotesEditor.tsx`; do not create the note again. Regression coverage must exercise immediate exit before their 400 ms timers, including body/source editing where applicable.

## Risks / Trade-offs
Pending title or body edits could be lost during navigation: verify stored content after immediate completion and reopening, without introducing a second persistence path. Read-only notes must remain read-only; finishing is navigation only.

No data model, API, dependency, image-size or server-memory change. Reuse the existing arrow and translated Done text. Interface budget: replace one icon in an existing control; add no chrome, destinations, scroll regions or shortcuts. Deploy or roll back with the ordinary web/server build.
