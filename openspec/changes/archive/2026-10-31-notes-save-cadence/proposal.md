# Push note documents after a pause, not after every keystroke pause

## Why

The note editor saves a full Yjs state 400 ms after the last keystroke (`SAVE_MS` in `web/src/app/NotesEditor.tsx`), and every local mutation asks the sync loop to run 250 ms later (`requestSync()` in `web/src/lib/sync.ts`). So each short pause while typing becomes a `notes_doc` op on the server: a whole document of up to 256 KB plus its Markdown projection. Ten minutes of writing in a long note can push a hundred or more full copies, every one of which stays in the log for at least 30 days even after `notes-compaction`, and is served to every device of every member in the meantime.

Saving on the device after every pause is right: it keeps typing safe across a crash or a closed tab. Pushing every one of those saves is not needed. Collaborators only need to see the text within a few seconds of the writer stopping, and the outbox already keeps one pending document per note (a newer state replaces the queued one). The owner decided (DECISIONS.md, "Notes storage safety", 2026-10-31): save locally on every pause; push `notes_doc` after 3 s quiet, on blur, close, hide and unload, and at least every 60 s while typing.

## What Changes

- **Local save unchanged.** The editor still writes the document and its projection to the device (IndexedDB and the outbox) 400 ms after the last keystroke, and on blur, close, hide and unload.
- **Push cadence for note documents.** A local write of a note document no longer asks for a sync at 250 ms. The client pushes it:
  - after **3 seconds without a further note save** (each save restarts the 3 s),
  - **at once** when the editor loses focus, closes (the task or project closes, the panel changes task), the page is hidden or unloaded, or the app navigates away,
  - and **at least every 60 seconds** while the person keeps typing without a 3-second pause.
- **Never held back.** Any exchange that runs for another reason (another edit, the periodic timer, a live wake-up, coming back online) carries the pending document as today. Nothing waits for the timer except the trigger.
- **Outbox unchanged.** One pending `notes_doc` op per note; a newer save replaces it, so the 3-second pause pushes only the latest state.
- **Collaborators** see a writer's text about 3 seconds after the writer pauses, plus the live channel's delivery, and at least once a minute during continuous typing. Remote changes keep merging into an open editor in place.
- **Offline** unchanged: saves go to the outbox and are pushed on the next successful exchange.
- **Comments unaffected.** The comment composer submits a comment only when the person sends it; it never writes a document op while typing, so it keeps today's behaviour. Plain-text note editing (the fallback textarea, REST, CalDAV) is unchanged.
- Docs: docs/sync.md "Mergeable documents" and the triggers list in "Exchange".

Not **BREAKING**: client-only, no op format change, no new environment variable, no route.

## Out of scope

- The interval values as settings: 3 s and 60 s are constants.
- Holding back a note op that another exchange would carry (see design D3).
- Server-side changes: compaction is `notes-compaction`.
- Any change to the comment composer, plain-text fields, or other fields' 250 ms sync.

## Roadmap

Advances milestone 0.19 "Series and time", item `notes-save-cadence` (second of the notes changes, after `notes-compaction`). GitHub issue: [#653](https://github.com/OpenTodoApp/OpenTodo/issues/653).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rich-text-editing`: ADDED "Note push cadence"; MODIFIED "Remote edits while editing" (when a collaborator's change appears).
- `offline-first-sync`: MODIFIED "Sync triggers and status" (a note document edit is pushed after its pause, not shortly after the edit).

## Impact

- **Web:** `web/src/lib/ops.ts` (`MutateOptions.push: 'deferred'` reported to mutation listeners), `web/src/lib/sync.ts` (the note push timers beside `requestSync`), `web/src/app/NotesEditor.tsx` (deferred saves, an immediate push on blur, close, hide, unload and unmount). Project notes use the same editor and follow.
- **Server, API, CLI, MCP, data model:** none.
- **Size:** no dependency; bundle growth under 0.5 KB gzip.
