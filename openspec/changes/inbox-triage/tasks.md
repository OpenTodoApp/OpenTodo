# Tasks

## 1. Queue, progress and announcements (design D2, D7)

- [ ] 1.1 Create `web/src/lib/triage.ts` with `buildQueue(tasks, order)`, `advanceQueue(state, liveTasks)`, `progress(state)` and the announcement strings (outcome and "n of N: title"). Verify with vitest cases for the spec scenarios: "5 of 17" after three decisions and a skip, a task arriving ("4 of 18"), the current task leaving, subtasks never queued, `k` not double-counting (`npm test` in web/).

## 2. The triage view (design D1, D3, D4, D6, D7)

- [ ] 2.1 Add `{ view: 'triage' }` at `/triage` to `web/src/app/router.ts`, render a lazy `TriageView` in `Shell.tsx`, add `g` then `p` to the Shell chord, and add the **Process** control with the open count to the Inbox header in `TaskListView.tsx`. Verify with the router test and a component test that `g` `p` navigates and the control is hidden at zero (`npm test`).
- [ ] 2.2 Build `web/src/app/TriageView.tsx`: the focused card (title, `NotesEditor` read-only, due, labels, reminders), the progress line, the live region, the decision bar with key hints, and the `keydown` handler that ignores text fields and open overlays. Wire `t`, `c`, Delete/Backspace, `j`/Space, `k`, Enter (detail panel over the card) and Escape (back to the Inbox with the task selected). Verify with component tests for each key and for focus returning to the card after an advance, plus an axe check (`npm test`).
- [ ] 2.3 Wire `s` (`DateField` inline, Enter applies, Escape cancels), `m` (`ProjectPickerField` sources; `updateTask` same scope, `moveTaskAcrossScopes` otherwise) and `l` (`LabelPicker` inline, no advance). Verify with component tests for "Schedule with a typed date", "Move to a shared project", "Cancel a picker" and "Label then move" (`npm test`).
- [ ] 2.4 Build the delegate picker from `membershipMap()` ("Ana · Household" entries, disabled state with explanation when empty) and apply `{ project_id, assignee_id }` in one batch. Verify with a test that the batch holds both fields with one timestamp, and one for the disabled state (`npm test`).
- [ ] 2.5 Register the mode's `ListState` so the Vim layer's `j`/`k`/`x`/`dd`/`gg`/`G`/`:q` work, add `triage` to `vim/commands.ts` and the rows to `vim/help.ts`. Verify with `vim/commands.test.ts` and `dispatch.test.ts` cases for `:tri` completion and `dd` in the mode (`npm test`).
- [ ] 2.6 Add the Someday gate (`hasSomeday` constant, button, key, shortcut row and help entry all behind it) with a test asserting the button's presence equals the constant; leave the constant `false` with a comment naming `someday-and-evening`. Verify with `npm test`.
- [ ] 2.7 Add the `go` row and the new `triage` section to `web/src/lib/shortcuts.ts`, run `make docs`, and add the help id `inbox/triage`. Verify with `npm run docs:check` in web/ and `npm run build`.

## 3. Documentation (design D8)

- [ ] 3.1 Add "Process the Inbox" to `docs/views.md` (the flow from the inbox-zero guide, every key, the Someday note, the "no undo yet; `k` goes back" note) with `screens: [inbox/triage]`, and extend the Inbox row of the views table. Verify with `npm run docs:check` and `make docs` producing the regenerated keyboard guide.
- [ ] 3.2 Add the screenshot of the mode to `docs/images/` through `make docs-screenshots` (light and dark). Verify the images are referenced from `docs/views.md` and `npm run docs:check` passes.

## 4. Integration

- [ ] 4.1 Extend `scripts/e2e-smoke.mjs` with a triage pass: seed six Inbox tasks, `g` `p`, apply one of each decision, check the progress text and the Inbox afterwards; run the layout check at 360 px. Verify with `make layout-check` and the smoke script against `make run`.
- [ ] 4.2 Manual smoke on `make dev`: process an Inbox of ten tasks with the keyboard only, once with Vim keybindings on; go offline, process three, reload, reconnect and confirm a second browser profile converges; with a screen reader (VoiceOver or NVDA) confirm the announcements. Record the result in the change folder notes.
- [ ] 4.3 Run `make check` (go test, web test and build, docs check, openspec validate). Verify it passes.

## 5. Coordination with sibling changes

- [ ] 5.1 If `someday-and-evening` has landed: flip the gate to its exported constant and implement `y` (`start: 'someday'`), with a test for "After the field exists". Otherwise leave a note in that change's tasks to do it. Verify with `npm test`.
- [ ] 5.2 If `bulk-edit` has landed: record each decision in its undo store and show its toast with Undo. Otherwise leave a note in that change's tasks. Verify with the undo test of that change extended by one triage case.

## Workflow follow-up

- Add a CHANGELOG.md entry under Unreleased ("Process the Inbox one task at a time: `g` `p`").
- Tell the OpenTodoWebsite maintainer that the inbox-zero and GTD guides can link the mode once the release that contains it is pinned in `bundle.json`.
- Archive with `/opsx:archive`, then confirm `npx @fission-ai/openspec validate --all --strict` passes.
