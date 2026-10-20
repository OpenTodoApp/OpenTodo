# Tasks

Frontend tasks are verified with `npm test` and `npm run build` in `web/` unless another command is named. Each group leaves `make check` green; group 1 can land alone because nothing renders it yet.

## 1. The facet model

- [x] 1.1 Add `web/src/lib/facets.ts` with `facetsOf(task, ctx)` building the Where, When, How and Who parts from the row's formatters (`describeDue`, `describeDeadline`, `formatMinutes`) and one table of nouns (deadline, from, since, Someday, evening, waits for, blocks, the zone city); verify with `facets.test.ts` covering the full task of the web-app delta ("Full task reads as four lines"), the empty task (Where, When "Not scheduled", How "P4"), a past start ("since"), a parked task, an overdue deadline tone, a zoned due suffix, a floating due with no suffix, and a viewer.

## 2. Facet lines and popover editors

- [x] 2.1 Add `FacetLine.tsx` (icon, parts as buttons or spans, label chips inline, `data-facet` and `data-part`, truncation with a tooltip) and `FacetEditor.tsx` (a `Popover` with the facet's title, an optional segmented control, Clear and Done); verify with `facetLine.test.tsx`: parts are in the tab order, Enter opens the editor, Escape and Done close it with focus back on the part, Clear writes the clear op and closes, viewers get no buttons.
- [x] 2.2 Replace `Properties.tsx` and `PropertyChip.tsx` with `Facets.tsx`: the four lines, one editor at a time, the revealed-by-Add rule, the list-row signals opening the right editor, every part bound to the same ops the chips wrote; verify with `propertyChips.test.tsx` rewritten as `facets.test.tsx` (the former chip assertions re-stated per part), `assignee.test.tsx`, `priority.test.tsx` and `subtasks.test.tsx` passing unchanged in behaviour.
- [x] 2.3 Give `WhenControl` a `segment` prop with a segmented header showing one segment, move the Evening switch and `ZoneControl` into Do on, and remove the zone chip and hint from the panel at rest; verify with `whenControl.test.tsx` (unchanged op payloads per segment, open on the clicked part, the deadline shortcut from a list opens the Deadline segment) and `zoneControl.test.tsx` (suffix on the Do on part only when fixed, disabled with its reason inside the segment without a time).
- [x] 2.4 Build the Add menu from the entry table grouped by facet with Attach last; verify with `facets.test.tsx`: groups without entries are omitted, picking Estimate reveals the part with its editor focused and "P4 · 1 h 30" after `1h30`, Escape without a value removes it and focuses Add.
- [x] 2.5 Update `budget.test.tsx` to count `[data-facet]` lines plus Add and the layout check selectors in `scripts/e2e-layout.mjs`; verify with `npm test` and `ENGINES=chromium make layout-check`.
- [x] 2.6 Update `docs/task-panel.md` ("Properties as chips" becomes "The four lines": Where, When, How, Who, the popover with Clear and Done, the grouped Add menu), `docs/tasks-and-projects.md`, `docs/notes-and-subtasks.md` (waits for, blocks), `docs/deadlines-and-start-dates.md`, `docs/dates-and-times.md` (the zone inside Do on) and `docs/interface-guide.md` ("The task panel"); verify with `npm run docs:check`.

## 3. The rest state of the panel

- [x] 3.1 Make the header title wrap to at most two lines and drop the subtasks badge from the header; verify with `taskDetail.test.tsx` (a long title renders on two lines, no badge in the header, the Subtasks heading carries the count) and the sticky-header scenario still passing.
- [x] 3.2 Add the notes clamp (`data-clamped`, eight lines, Show all, expanded on focus for the open task, never on the page variant); verify with `notes.test.tsx`: a forty-line note is clamped in the panel with the facet lines in view, Show all expands, the page variant is never clamped, a short note is never clamped.
- [x] 3.3 Add the composer's resting line and its expansion on focus, draft, reply target and `Shift+C`, collapsing when left empty; verify with `commentsTab.test.tsx` and `conversationTabs.test.tsx` (resting line at rest, expanded with a draft, `Shift+C` expands and focuses, thirty comments keep the line in view).
- [x] 3.4 Remove the empty-state Attach button (Attach stays in the header menu, the Add menu, paste and drop) and apply the compact density to facet lines and the subtasks list; verify with `attachmentsRow.test.tsx` (no Attach control at rest) and a density assertion in `facetLine.test.tsx`.

## 4. Stories, baselines and integration

- [x] 4.1 Rewrite the `Task/Panel` stories (empty task, full task, the When popover on Deadline, notes clamped, viewer) and update `Screens/Shell` list-with-panel; regenerate baselines; verify with `make ui-check` (axe clean in both themes, baselines match).
- [x] 4.2 Run `make check` and compare the gzipped entry chunk against the previous build, recording the difference in this file; verify with the build output.
- [x] 4.3 Run `npx @fission-ai/openspec validate --all --strict`; verify it passes.

## Workflow follow-up

- Archive the change after review and add a CHANGELOG.md entry under Unreleased.

## Implementation notes

- Entry chunk: 323.12 KB gzipped on main, 322.07 KB with this change (−1.05 KB): one editor frame instead of per-chip boxes.
- The origin is a part of the Where line that opens its source on click or Enter (task-origin); its Remove moved to the panel's header menu, next to a new Attach entry, so no line carries a clear button.
- Attach: the empty state has no button; the Add menu ("Choose files…", "Add a link…") and the header menu ask the attachments row through `attachRequest.ts`.
- `Popover` treats a press inside an overlay opened after it (a calendar or the zone picker inside the When popover) as inside, so nested pickers no longer close their parent.
- The When segments keep their editors as they are (`DueField` without its own clear button in the popover); their redesign is `task-panel-polish` groups 2 and 3.
- `make ui-check` (full visual run in the pinned container): only the Task/Panel stories and Screens/Shell list-with-panel changed; a new Task/Panel "When popover" story. Layout check (Chromium, 360/390/768, light and dark, inbox, today, project) passes with the new `when-popover` overlay.
