# Design

## Context

- `NotesEditor.tsx`: every editor transaction that changes the document writes it into the Yjs doc, marks it dirty and starts a 400 ms timer (`SAVE_MS`). `flush` (on the timer, blur, `visibilitychange` to hidden, `pagehide`, `beforeunload` and unmount) calls `mutate(entity, id, { notes_doc, note_mentions? })`.
- `mutateMany` (`web/src/lib/ops.ts`) pairs the document with its projection (`withNotePairs`), applies the ops locally, replaces any queued op of the same document field in the outbox ("one pending document per field"), adds the new ops and calls every `onLocalMutation` listener.
- `startSync` (`web/src/lib/sync.ts`) registers a listener that marks the status as syncing and calls `requestSync()`, which debounces an exchange by 250 ms. In a tab that does not hold the sync lock, `requestSync` asks the leader tab.
- An exchange uploads the whole outbox (up to 500 ops per request) and pulls.

## Decisions

**D1. Two clocks: save locally on every pause, push on a slower one.** The 400 ms local save stays: it is what makes typing survive a crash, a reload or a closed tab, and it costs only an IndexedDB write. Only the trigger of the network exchange changes for note documents.

**D2. How the push is scheduled.**

- `mutateMany` takes an option `push?: 'now' | 'deferred'` (default `'now'`, today's behaviour) and passes it to the listeners. `NotesEditor`'s timed save uses `'deferred'`; its flush on blur, hide, unload and unmount uses `'now'`.
- `sync.ts` keeps two timers for deferred pushes:
  - **quiet:** restarted at every deferred mutation, fires 3 s after the last one;
  - **max wait:** started by the first deferred mutation not yet pushed, fires 60 s later and is not restarted.
  Either firing calls `requestSync(0)` and clears both. A `'now'` mutation, or any exchange that starts for another reason, also clears both, since that exchange carries the pending document.
- In a tab that does not hold the sync lock the timers run in that tab and their firing posts `{type: "sync"}` to the leader, as `requestSync` does today.
- Close and navigation: the editor's unmount (panel closes, another task opens, route changes) already flushes; it now flushes with `'now'`.
- Unload and hide: `pagehide`, `beforeunload` and `visibilitychange` to hidden flush with `'now'`. The browser may not finish the request while unloading; the ops are already in the outbox (written before the push), so the next start pushes them. That is today's guarantee too.

Alternative considered: lengthen `SAVE_MS` to 3 s. Rejected: it widens the window of typing lost on a crash from 400 ms to 3 s and delays the local projection that lists and search read.

**D3. No hold-back of queued document ops.** An exchange started by anything else uploads the whole outbox, including the pending document, so a person who edits a due date while writing the note pushes the note too. We do not add a "not before" mark to outbox rows: it would make the outbox order and the sign-out path more complex, and a hold-back could delay data that is ready. The cost is that the cadence is a ceiling on the number of pushes, not an exact interval, which is all the storage goal needs.

**D4. Number of ops.** With the outbox's one-pending-op rule, each push carries one document per note that changed. Typing in bursts with pauses shorter than 3 s produces no push until a 3 s pause or 60 s pass; today every 400 ms pause plus 250 ms produced one. In the test of task 2.2 (a scripted 10-minute session with 1-to-2-second pauses) the number of `notes_doc` ops sent drops from about one per pause to at most one per minute plus one per 3-second pause.

**D5. What collaborators see.** The writer's device pushes about 3 s after the writer stops (or every 60 s while they keep typing); the server wakes the other devices over the live channel at once; they pull and merge into their open editor in place (`rich-text-editing` "Remote edits while editing"). On a local network that is about 3 to 4 s after the writer pauses. The requirement is modified to say so; the previous "within two seconds" counted from the push.

**D6. Comments unaffected.** The comment composer edits a local draft and submits the comment when the person sends it; it never writes `notes_doc` and never syncs while typing. It keeps today's behaviour and nothing in it changes. Plain-text notes (the fallback textarea saving on blur, REST, CalDAV, email) are single writes and keep the 250 ms trigger.

**D7. Status indicator.** The indicator already shows a pending change as soon as a mutation is queued (it never claims "Synced" while an op waits). During the 3 s quiet window it therefore shows the edit as pending, as it does during today's 250 ms window, only longer. No new state.

**D8. Offline and convergence.** Offline, deferred and immediate pushes alike leave the ops in the outbox and the next successful exchange sends them; nothing changes. Convergence is unchanged: the server receives fewer intermediate documents, each a full state, and every device still merges whatever it receives (merge and republish). Fewer intermediate states cannot lose text, because each pushed state contains everything saved before it on that device.

## Data model impact

None. No op field, no schema change; the outbox keeps its shape.

## Size and memory

No dependency. Two timers in the sync module; bundle growth under 0.5 KB gzip. No effect on the server image or memory.

## Interface budget

No screen change: no chrome row, no destination, no scroll region, no shortcut.

## Open questions

None for the owner: the intervals are the owner's.
