# Design

## Context

See proposal.md for the motivation and `UX-EXPLORATION.md` section 3 for the measurements. The relevant facts for the approach:

- `web/src/app/task-detail/Properties.tsx` (420 lines) renders a breadcrumb row and a wrapping row of `PropertyChip`s; each chip owns its editor as a `basis-full` box in the same flex row, so opening one re-flows everything below. Clear actions are separate buttons after the chip. `WhenControl.tsx` stacks six segments; `ZoneControl.tsx` is a chip plus popover rendered as the due chip's `aside`.
- The list row builds its metadata through `describeDue`, `describeDeadline` and `zoneHint` in `web/src/lib/dates.ts`, `formatMinutes` in `web/src/lib/duration.ts` and the metadata rules of `task-list-presentation`; the panel formats the same facts itself (`dt.formatDate(local.date, 'long')`), which is why the two disagree.
- `web/src/app/overlay/Popover.tsx` anchors a panel to a trigger from 640 px and renders a bottom sheet below, with focus return and `data-overlay` isolation; the Combobox, the zone control and every menu already use it. The budget test ignores `[data-overlay]` when counting scrollers.
- List-row shortcuts open the panel with a given editor through the signals in `web/src/app/signals.ts` (`blockedByFocus`, `deferFocus`, `deadlineFocus`, `estimateFocus`); `Properties.tsx` consumes them to reveal a chip.
- The composer (`Composer.tsx`, `CommentsTab.tsx`) is portalled into the panel's pinned footer; drafts live in `sessionStorage`.
- The notes editor is a lazy chunk inside `.notes-host`; `index.css` styles it.
- Stories: `Task/Panel` (empty, full, notes editing, viewer) with baselines at 375 and 1280 in both themes; `Screens/Shell` list-with-panel.
- `budget.test.tsx` counts `[data-property-chips] [data-property]` plus the Add control on an empty task (at most seven).

Constraints: no new dependency, every write through `mutate()`, no op change, keyboard-first, WCAG 2.2 AA from 360 px, the interface budget.

## Goals / Non-Goals

**Goals:**
- Properties that read as four sentences, in the row's words, at a stable height.
- One editor frame (title, segments, Clear, Done) for every property, as an overlay.
- Fewer interactive elements at rest (eleven parts and Add on the fullest task, instead of eighteen buttons).
- Zero behavioural change in what each editor writes.

**Non-Goals:**
- Rewriting the editors (`DueField`, `DateField`, `RecurrenceField`, `RemindersField`, `EstimateField`, `LabelPicker`, `AssigneePicker`, the pickers): they are composed as they are.
- The task page's two-column layout and typed natural language on the When line (later changes).
- Changing Activity, History, subtasks or attachments beyond what the proposal lists.

## Decisions

### D1. A pure facet model, built from the task
`web/src/lib/facets.ts` exports `facetsOf(task, ctx)` returning `{ where, when, how, who }`, each an ordered list of parts `{ id, text, tone?, segment?, empty? }`, where `ctx` carries the resolved project, section, parent, labels, reminders count, blockers, dependents, membership and the user's date and time formats. The text of every date part comes from the same functions the row uses (`describeDue`, `describeDeadline`, `formatMinutes`), so "Tomorrow 09:00", "repeats" and "9d" expand to the panel's longer forms ("every 3 months", "deadline Sun 25 Oct, 9 days") through one table of words. The nouns are fixed: "deadline", "from" (future start), "since" (past start), "Someday", "evening", "waits for", "blocks n", a zone city as a suffix. `facetsOf` is unit-tested against fixtures, including the empty task and the viewer.

*Alternative:* keep the chip components and change their CSS. Rejected: the words and the grouping are the problem, and both live in `Properties.tsx` as JSX.

### D2. `FacetLine` renders parts; `FacetEditor` frames every editor
`FacetLine` is one flex row: the icon, then the parts as buttons (viewers: spans) separated by "·", with the label chips rendered inline in How. A part has `data-part="<id>"` and `aria-label` "<facet> · <part>". Activating a part sets `editing = { facet, part }` in `Facets.tsx`; one `FacetEditor` is rendered through `Popover` with the part's button as `anchor`, `role="dialog"`, modal, titled with the facet's icon and name, and a footer with Clear (shown when the part has a value, bound to the same op the chip's `onClear` wrote) and Done. Escape, Done and single-value commits (priority, section, project, assignee, parent) close it; multi-value editors (labels, blockers, reminders) stay open until Done. The panel's content never re-flows because the editor is an overlay.

The existing `PropertyChip` behaviours that matter (focus return, Escape, the "revealed by Add, removed when empty" rule, the signals from list-row shortcuts) move into `Facets.tsx` unchanged; `settleRevealed` keeps its 50 ms wait for the live query.

*Alternative:* inline editors under the facet line (a box that pushes only the lines below). Rejected: the When control is taller than the panel, so the box would still push everything; and popovers are already the pattern for pickers and the zone control.

### D3. The When popover is `WhenControl` with one visible segment
`WhenControl` gains `segment` and `onSegmentChange`: it renders a segmented control (Do on, Start, Deadline, Repeat, Reminders) in the editor's header and only the chosen segment's body. The Evening switch and `ZoneControl` move into the Do on segment; the zone control's own popover nests as today (the overlay stack supports it). Each segment writes exactly what it writes now; `whenControl.test.tsx` keeps its op-payload assertions and gains the single-segment navigation.

### D4. The rest state of the panel
- **Header**: the title becomes an auto-growing single-line textarea capped at two lines (`rows` computed from scroll height, Enter blurs as today); the subtasks `Badge` leaves the header.
- **Notes clamp**: `.notes-host[data-clamped]` sets `max-height` to eight lines with a fade and a "Show all" button; `TaskDetail` measures the rendered editor once after load (and after remote changes) and sets the attribute when the content exceeds it, clears it on focus or Show all for the lifetime of the open task, and never sets it in the `page` variant.
- **Composer**: `Composer` takes `resting`; the footer renders a one-line button-like field ("Write a comment…") that expands into the real composer on click or focus, when a draft exists for the task, when a reply target is set, or when `Shift+C` fires (`ConversationTabs` already owns that shortcut). Leaving the expanded composer empty collapses it.
- **Attachments**: the empty-state Attach button is removed; Attach stays in the header menu and the Add menu (under Where? no: as its own last entry, outside the facet groups) plus paste and drop, as the attachments spec already says.
- **Density**: `[data-density="compact"]` tightens `.facet-line` and the subtasks list by the same step as rows.

### D5. Add menu groups
The Add menu lists the remaining entries as `MenuGroup`s titled Where, When, How, Who (empty groups omitted) followed by a separator and Attach. The entry table in `Facets.tsx` carries each entry's facet and segment, so picking one reveals its part and opens the popover on the right segment.

### D6. Interface budget
Visible properties: four facet lines on the fullest task, three on an empty one; `budget.test.tsx` counts `[data-facet]` lines plus the Add control (at most seven) instead of chips. Scroll regions: unchanged; the popover is an overlay and the clamp uses `max-height` with `overflow: hidden`, not a scroller. Chrome rows above a list: unchanged. Shortcuts: none added; `1` to `4`, `Shift+C`, `z` (now inside the Do on segment, same registry entry with the `panel` scope) and the list-row openers keep their ids.

## Risks / Trade-offs

- [A part's text can be long (a blocker's title)] → parts truncate at one line with the full text in a tooltip, and the Who line wraps after the assignee.
- [Popover inside the panel on 768 to 1023 px, where the panel is a sheet] → `Popover` already flips and shifts within the viewport; the story at 1280 and the layout check at 768 cover it.
- [Users who relied on the "×" beside a chip] → Clear is the first footer action of every popover and the Help page says so; the zone chip and the hint, which were the loudest "controls between values", are gone.
- [The title textarea changes the header's height] → capped at two lines, so at most one extra line; the sticky header keeps working.
- [Measuring the notes for the clamp after a lazy chunk loads] → measure in the editor's `onReady` and on `ResizeObserver` of the host; clamp only when the content exceeds the limit by more than one line, so short notes never flicker.
- [The budget test and the layout check select `[data-property-chips]`] → selectors change in the same tasks as the components.

## Migration Plan

Client-only, one release. No stored state changes shape; `ot.taskTab` and the comment drafts keep their keys. Rollback is a client rollback.
