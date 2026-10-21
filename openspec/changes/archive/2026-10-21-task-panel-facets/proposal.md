# Proposal

## Why

The task panel's property chips (web-app "Task panel property chips", `ux-overhaul` D4) show what is set and offer the rest, but a task with every property set renders twelve chips of one shape in seven wrapped lines (302 px), with four "clear" buttons floating between them, three dates in three formats told apart only by a 12 px icon, a zone control styled as a selected button, editors that open inline as a box taller than the panel (the When control is 817 px), and a comment composer that costs 133 px at rest. The list row says "Tomorrow 09:00 · repeats · 9d" for the same facts; the panel does not use that language (`UX-EXPLORATION.md`, section 3). This change gives the properties a structure, moves the editors out of the flow, and makes the panel read as a document again.

## What Changes

- **Four facet lines replace the chip bag.** Where (project › section, the parent task), When (do on, repeat, deadline, start, evening, reminders, zone), How (priority, estimate, labels) and Who (assignee, blocked by, blocks). Each facet is one line with a leading icon whose parts are separate buttons and read with the row's words ("Tomorrow 09:00 · every 3 months · deadline Sun 25 Oct, 9 days · since Wed 14 Oct · 2 reminders"). Where, When and How are always shown; Who when it has a value. One Add menu, grouped by facet, offers the rest with their shortcuts.
- **Editors are popovers, not inline boxes.** A part opens its editor anchored beside it (a bottom sheet below 640 px); the panel's layout does not move. The When popover shows one segment at a time (Do on, Start, Deadline, Repeat, Reminders), chosen by the part that was clicked; Evening and the time zone live inside Do on. Every popover has a footer with Clear and Done, which replaces the floating "×" buttons.
- **The zone retreats.** The zone reads as a suffix of the Do on part only when the due is fixed to a zone; the hint line about setting a time leaves the panel at rest.
- **Notes clamp at rest.** Notes longer than about eight lines show a "Show all" line in the panel until expanded or focused; the task page never clamps.
- **The composer rests as one line** and expands when focused or when `Shift+C` is pressed.
- **The header title wraps** to two lines instead of truncating, and the subtasks badge leaves the header (the Subtasks heading carries the count).
- **Attachments at rest**: no Attach button in the empty state, as the attachments spec already requires; Attach stays in the header menu, the Add menu, paste and drop.
- Facet lines and the subtasks list follow the density preference.

No data model, op schema or API change: every part writes exactly the operation its chip wrote. No new environment variable. Not **BREAKING**.

**Out of scope**: the two-column task page (`task-page-columns`), typed natural language on the When line (`when-line-capture`), the editors' internals (date fields, recurrence, reminders, pickers stay as they are), the Activity and History tabs, and the sidebar (`sidebar-groups`, `sidebar-favourites`). ROADMAP.md item advanced: none directly; this continues the "Design refresh" step 4 (`task-detail-redesign`) and `ux-overhaul` D4.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-app`: "Task detail panel" and "Task panel layout" (facets, the clamp, the wrapping title); "Task panel property chips" is removed and replaced by new requirements for the facet lines, popover editors, the grouped Add menu, keyboard operation and the notes clamp; "Task panel comment composer" (the resting line).
- `deadlines`: "Deadline entry" (the deadline is a part of the When line and a segment of the When popover).
- `start-dates`: "Setting when from the panel and the keyboard" (the start reads "from" or "since" on the When line; the Start segment).
- `task-dependencies`: "Dependencies in the detail panel" (blockers are parts of the Who line; the Blocks list lives in its popover).
- `task-assignment`: "Assignee on task rows and detail" (the assignee is a part of the Who line; the solo-scope switch lives in its popover).
- `task-management`: "Zone control" (the zone as a suffix of the Do on part and a control inside the Do on segment).
- `comments`: "Composer behaviour" (the resting line).

## Impact

- **Code**: `web/src/app/task-detail/` (`Properties.tsx` and `PropertyChip.tsx` replaced by `Facets.tsx`, `FacetLine.tsx` and `FacetEditor.tsx`; `WhenControl.tsx` gains a single-segment mode; `ZoneControl.tsx` moves into the Do on segment; `TaskDetail.tsx` header, notes clamp and footer; `CommentsTab.tsx` and `Composer.tsx` resting state; `ConversationTabs.tsx`), a pure `web/src/lib/facets.ts` that builds the parts from a task, reusing the row's metadata words, `web/src/index.css` (notes clamp, facet line classes), the `Task/Panel` and `Screens/Shell` stories and baselines, `budget.test.tsx` (counts facet lines), `docs/task-panel.md`, `docs/tasks-and-projects.md`, `docs/notes-and-subtasks.md`, `docs/deadlines-and-start-dates.md`, `docs/dates-and-times.md`, `docs/interface-guide.md` ("The task panel"), the task panel Help page, the layout check selectors.
- **Server and API**: none. Every write keeps going through `mutate()`.
- **Dependencies**: none added. The client is expected to shrink slightly (one editor frame instead of per-chip boxes); the lazy chunks are unchanged.
- **Interface budget**: at most four facet lines at rest (three on an empty task), so visible properties stay under seven; scroll regions unchanged (popovers are overlays; the clamp is not a scroller); no new shortcut; `1` to `4`, `Shift+C`, `z` and the list-row shortcuts that open an editor keep their meaning.
