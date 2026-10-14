# Tasks

Prerequisites: `design-language`, `ui-primitives` and `date-time-preferences` are applied. Every task below is a frontend task: besides the check it names, verify with `npm test` and `npm run build` in `web/`.

## 1. Pure helpers

- [x] 1.1 Add `web/src/lib/pickerSources.ts` with `projectSource`, `parentSource` and `sectionSource` (design D2), plus `pickerSources.test.ts`. Verify that tests cover: the Inbox first; tree order with paths; same-name projects told apart by path; archived projects only as the current value; self and descendants excluded from parents; completed or deleted current parents marked; sections in board order.
- [x] 1.2 Add `isSoloScope()` to `web/src/lib/sharing.ts` (D3) with tests for the Inbox, an unshared project, a shared project with only the viewer, and a shared project with two members. Verify with `npm test`.
- [x] 1.3 Add `setDueZone()` to `web/src/lib/dates.ts` (D4) with tests: floating to New York keeps the wall time (`15:00` on 2026-11-02 shows `21:00` for a Berlin viewer); zoned to another zone keeps the wall time; a due without a time is rejected; an unknown zone is rejected via `isKnownZone`. Verify with `npm test`.
- [x] 1.4 Add `web/src/lib/activityRuns.ts` with `groupRuns` and `summarizeRun` (D6), plus tests. Verify that tests cover: a same-actor burst inside 10 minutes forms one run; another actor in between splits it; the window edge; comment kinds are kept as single entries; pending propagation; the summary text with "and N more". Also verify against `internal/activity/testdata/activity_fixture.json`.
- [x] 1.5 Add `web/src/lib/historyVersions.ts` with `toVersions` and `summarizeVersion` (D7), plus tests. Verify that tests cover: merging within 5 minutes per user and device; no merging across devices; a field changed twice collapses to first `from` and last `to`; lost changes keep their marker; the summaries "Renamed and rescheduled" and "Completed"; Oxford comma beyond two verbs.

## 2. Panel shell and properties rows

- [x] 2.1 Split the panel into `web/src/app/task-detail/` (`TaskDetail.tsx`, `Properties.tsx`, `PropertyRow.tsx`), with `app/TaskDetail.tsx` re-exporting it. Verify that the app compiles with unchanged imports (`npm run typecheck`) and that the existing panel behaviour works in `make dev`.
- [x] 2.2 Build the header: Complete, a progress Badge, a `kind="menu"` overflow (Delete, Copy link, Open parent, Open recurring task) and Close, all with Icons. Verify with a vitest component test that Delete from the menu trashes the task and closes the panel, and that the menu is keyboard navigable.
- [x] 2.3 Implement `PropertyRow` read and edit modes (D1): the value button, Enter or Space opens the editor, Escape or commit returns focus, quiet placeholders for empty values. Verify with a component test covering the "Edit a row with the keyboard" and "Values read as values" scenarios.
- [x] 2.4 Move Priority, Estimate, Repeat, Labels and Subtasks into rows and sections with the new primitives. Keep the `1`–`4` shortcuts. Verify by setting priority with the keyboard shortcuts and with the segmented control in a component test.
- [x] 2.5 Viewer mode: render values without editors, show the read-only note, omit Complete and Delete, keep the composer. Verify with a component test of the "Viewer opens a task" scenario.
- [x] 2.6 Add a Storybook story for `PropertyRow` and the assembled properties card (light and dark, 375 and 1280, seeded fixture task). Verify that `make ui-check` passes with new baselines from `make ui-baselines`.

## 3. Entity pickers

- [x] 3.1 Replace the task detail Project select with a Combobox over `projectSource`, with rank context `task.project` and a "Create project" row that creates through the existing ops and then moves the task. Verify with a component test: offline create-and-move, following the copy on a cross-scope move, and the archived current project shown first.
- [x] 3.2 Replace the Section select with a Combobox over `sectionSource`; a subtask with a live parent shows the read-only explanation. Verify with a component test of the "Subtask section" scenario and an offline section pick.
- [x] 3.3 Replace the Parent select with a Combobox over `parentSource`, keeping the error message from `setTaskParent`. Verify with component tests of "Descendants excluded" and "Current parent is completed".
- [x] 3.4 Place the `ui-primitives` AssigneePicker and LabelPicker in their rows. Verify that labels can be added and removed and an assignee picked in a shared project, by component test.
- [x] 3.5 Migrate the sidebar new-project "Parent project", the ShareCapture project and the Import target project selects to Combobox with their own rank contexts. Verify with the existing `importScreen.test.tsx` and `ShareCapture.test.ts` updated, the latter picking a project by typing.
- [x] 3.6 Update `scripts/e2e-layout.mjs` with overlays `project-picker`, `parent-picker` and `section-picker` on the project screen. Verify that `node scripts/e2e-layout.mjs` passes at 360, 390 and 768 px in light and dark.

## 4. Assignee in personal scopes

- [x] 4.1 In a solo scope, render the Assignee row as Avatar + "You" with a "Show in Assigned to me" Switch writing `assignee_id` me or null. Shared scopes with several members keep the picker. Verify with component tests: an unassigned personal task reads "You" and writes no op (assert the Dexie `outbox` is unchanged); the switch on assigns, and Assigned to me lists the task; after a membership with two members arrives, an unassigned task reads "Unassigned".
- [x] 4.2 Document the behaviour in the task-assignment section of the user guide (`docs/`). Verify that `make docs-check` passes.

## 5. Time-zone control

- [x] 5.1 Build `ZoneControl` (D4): a chip with city and offset or "Floating"; a popover with the two explained modes, "Fix to my zone" / "Make floating", a zone Combobox (viewer zone pinned, rank context `due.zone`, `Intl.supportedValuesOf` with fallback), and a live preview; disabled with a reason when there is no time. Verify with component tests: the "Meeting in another city" preview and result; "No time set"; a recently used zone listed after the viewer zone.
- [x] 5.2 Move the `z` handler into `ZoneControl` unchanged and keep `ZONE_TOGGLE_KEY` exported for the shortcut help. Verify that the existing `dates.test.ts` zone scenarios still pass, plus a component test for `z` fix and release.
- [x] 5.3 Add a Storybook story (floating, zoned in the viewer zone, zoned elsewhere, disabled) and a `zone-control` overlay in `scripts/e2e-layout.mjs`. Verify that `make ui-check` and the layout check pass.
- [x] 5.4 Update the time-zone section of the user guide with the new control and a screenshot. Verify that `make docs-check` passes.

## 6. Comments tab

- [x] 6.1 Add `ConversationTabs` (Comments with count, Activity, History) with the last tab remembered in `localStorage` (try/catch, Comments as the fallback) and `Shift+C` switching to Comments and focusing the composer. Verify with component tests for "Shortcut to the composer" and "Remembered tab".
- [x] 6.2 Render threads oldest first with the Timeline thread item: Avatar, name, relative time with an absolute `title` and `aria-label` in the user's format, "edited" marker, `max-w-prose` body, hover and focus actions always visible on touch, indented replies. Verify with component tests for "Chronological reading", "Absolute time on focus" and "Actions on touch" (coarse pointer mocked).
- [x] 6.3 Restyle the composer: auto-growing to about 10 lines, at the bottom, a reply target chip with cancel, the `Ctrl/⌘+Enter` hint, and a per-task draft in `sessionStorage`. Replace the comment delete `confirm()` with the shared Dialog. Verify with component tests for "Draft survives closing the panel", "Cancel a reply" and keyboard-only posting; keep the mention combobox tests green.
- [x] 6.4 Update `scripts/e2e-layout.mjs` (`mention-picker` now under the Comments tab) and add a Storybook story for a thread with replies and a deleted comment. Verify that the layout check and `make ui-check` pass.

## 7. Activity tab

- [x] 7.1 Render activity with `groupRuns`: a run line with Avatar, kind Icon, summary, relative time and a pending marker, expandable to events; comment events as compact lines that open the Comments tab at the comment; "Load older" paging via `fetchActivity` and `mergeOlder`. Verify with component tests for "Burst of edits", "Different actors are not merged", "Pending inside a run", "Comment events are compact", and offline rendering.
- [x] 7.2 Add a Storybook story for runs (single, grouped, pending, comment line). Verify that `make ui-check` passes.

## 8. History tab

- [x] 8.1 Render versions with `toVersions`: Avatar or device label, summary, relative time, expandable diffs with the old value struck through and the new emphasised, formatted values (due via preferences, priority Badge, label chips, reference names), "not applied" for lost changes, and per-field "Restore this value". Load the tab lazily. Verify with component tests for "Summary line", "Bursts are grouped", "Readable values" and "Lost change" using a mocked `fetchHistory`.
- [x] 8.2 Add "Restore this version" with a confirm Dialog listing the fields, sequential `restoreValue` calls that follow a new id after a cross-scope restore, then `syncNow` and reload. Verify with a component test for "Restore a version" (two ops written, one new version after reload), and `history.test.ts` still green.
- [x] 8.3 Offline and error states with EmptyState ("History needs a connection to the server"). Verify with a component test for "Offline history tab" (navigator offline mocked) and the 404 empty state.
- [x] 8.4 Add Storybook stories (collapsed, expanded, lost change, offline) and a `task-history` overlay in `scripts/e2e-layout.mjs`. Verify that `make ui-check` and the layout check pass.

## 9. Reminders row layout

- [x] 9.1 Show reminders as Badge chips with a bell Icon. The add Menu (`kind="menu"`) offers presets, "Custom…" and "At a time…", using the date-time-preferences editors; snooze and dismiss go in a per-chip Menu. Verify with a component test that adds a preset reminder, snoozes a fired one and deletes one, all by keyboard, and that `reminders.test.ts` stays green.

## 10. Docs and integration

- [x] 10.1 Update the user guide pages for the task panel, comments and history in `docs/` (keeping help ids) and regenerate screenshots with `make docs-screenshots`. Verify that `make docs-check` passes and that the new screenshots show the redesigned panel in light and dark.
- [ ] 10.2 Update the panel selectors in `scripts/e2e-views.mjs` and `scripts/e2e-smoke.mjs`. Verify that both scripts pass against `./bin/opentodo`.
- [x] 10.3 Measure the bundle impact (gzipped entry and the lazy History chunk before and after `npm run build`) and record it in design.md "Size and runtime". Verify that the numbers are committed and the entry grows by less than 15 KB gzipped.
- [x] 10.4 Run `make check` and `make ui-check`. Verify that both pass.

## Workflow follow-up

- Add a CHANGELOG.md entry under Unreleased and a ROADMAP.md "Design refresh" row naming `task-detail-redesign` when archiving.
- Archive with `/opsx:archive` and confirm `npx @fission-ai/openspec validate --all --strict` passes afterwards.
