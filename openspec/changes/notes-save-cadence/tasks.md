# Tasks

## 1. Data layer

- [ ] 1.1 `web/src/lib/ops.ts`: `MutateOptions.push?: 'now' | 'deferred'` passed to `onLocalMutation` listeners (default `'now'`); verify `npm test` (a listener receives the option; the outbox still keeps one pending `notes_doc` op per note across deferred saves)
- [ ] 1.2 `web/src/lib/sync.ts`: the quiet (3 s, restarted) and max-wait (60 s, not restarted) timers for deferred mutations, cleared by a `'now'` mutation or any exchange; `requestSync(0)` when one fires; non-leader tabs post to the leader; verify unit tests with fake timers (saves every 1 s for 30 s → no exchange; a 3 s pause → one; 150 s without a pause → at least two; a `'now'` save → exchange at once; another field's edit → exchange carries the document), `npm test`

## 2. Editor

- [ ] 2.1 `web/src/app/NotesEditor.tsx`: the 400 ms save with `push: 'deferred'`; blur, hide, `pagehide`, `beforeunload` and unmount flush with `push: 'now'`; project notes follow through the same component; verify a happy-dom test (typing then blur sends at once; typing then 3 s of fake time sends once; a reload after 500 ms keeps the text locally), `npm test`
- [ ] 2.2 Count check: a scripted 10-minute session with 1–2 s pauses in `web/src/app/notesCadence.test.tsx` asserts the number of `notes_doc` ops uploaded is at most one per 3-second pause plus one per minute; verify `npm test`
- [ ] 2.3 Comment composer untouched: a test that typing a comment and waiting 3 s sends nothing; verify `npm test`

## 3. End to end

- [ ] 3.1 Two-context e2e (Playwright, local server): context B types a paragraph into a shared note and stops; context A shows it within 5 s; verify `make e2e`

## 4. Docs and checks

- [ ] 4.1 docs/sync.md: "Mergeable documents" (save 400 ms locally; push after 3 s quiet, on leave, at least every 60 s) and the triggers list in "Exchange"; verify `make docs-check`
- [ ] 4.2 CHANGELOG Unreleased entry (at archive)
- [ ] 4.3 `npm test`, `npm run build`, `make bundle-budget`, `make check`, `make openspec-validate`
