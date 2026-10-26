# Design

## Context

See proposal.md, "Why".

**The docked panel today** (`web/src/app/task-detail/TaskDetail.tsx:79-90`) is one scrolling body (`data-panel-body`, `overflow-y-auto`) that holds, in this order:
- `TaskRelations`,
- `TaskNotes clamp`,
- `Facets`,
- `FieldsGroup`,
- `Subtasks`,
- `AttachmentsRow`,
- then `ConversationTabs`, whose tab row is sticky inside that body.

**The clamp** is `NotesClamp` in `TaskNotes.tsx:27-64`. It lets the notes reach `NOTES_CLAMP_LINES = 8` lines plus one, after which the `.notes-clamp[data-clamped]` rule (`web/src/index.css:755`) caps the height with a mask and **Show all** appears. Focus or Show all expands it until the task changes.

**The task page** (`TaskPageView.tsx:124-150`) is a grid:
- the content (title, relations, notes, Attach) in column 1,
- the facts `aside` sticky in column 2 from 1024 px,
- then the rest in column 1.

Below 1024 px the grid is one column in DOM order, so the facts card follows the notes.

**The live spec**: `web-app` "Task panel layout" names the docked order ("the clamped notes, the facet lines with Add, …") and the page's "facts … under the notes below that". "Task panel notes clamp" mandates the clamp and Show all. Both come from `task-panel-facets` (D4) and `task-full-page`.

**The scroll-region budget** (`web/src/app/budget.json`, `MAX_SCROLLERS: 3`; design-system "interface budget"; counted by `verticalScrollers()` in the layout check). The project screen with the panel open already has exactly three regions: the sidebar (`Sidebar.tsx:421`), the list (`Shell.tsx:252`) and the panel body.

## Goals / Non-Goals

**Goals:**
- The properties sit at the same place on every task in the panel.
- The whole note is readable without a click.
- The screen stays within three vertical scroll regions.

**Non-Goals:**
- Making the properties sticky.
- Collapsing them.
- Changing the page layout from 1024 px.
- A per-task or per-device notes height.

## Decisions

### D1. Reorder the panel body; the notes go after the attachments

The panel body becomes: `TaskRelations`, `Facets`, `FieldsGroup`, `Subtasks`, `AttachmentsRow`, `TaskNotes`, then `ConversationTabs`.

The relations line (parent, "part of" links) stays first, because it says where the task sits, like the header.

The DOM order changes with the visual order, so Tab order and the screen-reader reading order follow: title → properties → notes → conversation. No CSS `order` is used.

### D2. No clamp and no inner scroller: the note grows inside the panel body

The issue asks for the notes to "expand up to the available screen height, with scrolling for longer content". An inner scroller in the panel would be a fourth vertical scroll region on every list screen with the panel open. That breaks the budget, and the layout check would fail.

It's also not needed any more. The clamp existed only to keep the facets in view under a long note (`task-panel-facets` D4). With the facets above the notes, that reason is gone. A long note now pushes down only the conversation, which the panel body scrolls to, and whose tab row is already sticky once reached.

So the note renders in full in the one panel scroller. `NotesClamp`, `NOTES_CLAMP_LINES`, the `clamp` prop and the `.notes-clamp` CSS are removed. The task page already passes `clamp={false}`, so it loses nothing.

Alternatives considered:

- **An inner scroller capped at the viewport height.** Rejected for the budget reason above. It would also nest one scroll inside another: wheel and touch chaining between note and panel is a known annoyance, and it is worse on trackpads.
- **An inner scroller exempted with `data-scroll-y`.** Rejected. That would hide a real fourth scroll region from the check that exists to prevent it.
- **Keep the clamp but put it after the properties.** Rejected. It keeps the click the issue asks to remove, with nothing left to protect.

### D3. Task page below 1024 px: facts above the notes

The content block splits into two column-1 blocks:
1. the head: title and relations;
2. the notes block: notes and the Attach tool.

The facts `aside` moves between them in the DOM. From 1024 px, the explicit grid placement that already exists (`lg:col-start-2 lg:row-span-2 lg:row-start-1`, sticky) keeps the facts in column 2 beside both blocks. The visible desktop layout is therefore unchanged (the row span grows by one, to cover head and notes).

Below 1024 px the single column reads: title, facts card, notes, fields, subtasks, attachments, conversation. That's the same "properties first" order as the panel.

Trade-off: on the desktop page, keyboard focus now goes title → facts → notes instead of title → notes → facts. That matches the panel and the reporter's priority, so we accept it.

### D4. Empty and read-only notes

An empty note keeps its quiet "Add notes…" line in its new place. A viewer sees the rendered note, or nothing if it's empty, as today. No heading is added: the facets need none, and a "Notes" label would add a row of chrome.

### Interface budget (docs/interface-guide.md)

- **Chrome above a list's first item:** unchanged, because the list is untouched.
- **Task properties visible by default:** unchanged. The same facet lines show; only their position moves up.
- **Sidebar destinations:** unchanged.
- **Vertical scroll regions:** still at most 3 on the project screen with the panel. D2 adds none, and removing the clamp removes no region (the clamp was `overflow: hidden`, never a scroller).
- **Shortcuts:** no new ones.
- **Task page:** the facts card is still one card of at most four groups. Only its place changes below 1024 px.

### Data model and size

No field, op or migration. The code shrinks by one small component and one CSS rule. No dependency, no image or memory effect.

## Risks / Trade-offs

- **[People who read comments first scroll further on tasks with long notes.]** → The conversation tab row stays sticky once reached. Measure on the `Task/Panel` long-note story. If it's a problem in practice, a "Comments" jump in the header is a separate change.
- **[Muscle memory: notes were right under the title for months.]** → The CHANGELOG and `docs/task-panel.md` say so, with the issue link.
- **[The page grid change could shift the desktop layout.]** → The task page story baselines at 1280 px must show no difference. Only the 768 and 375 px baselines may change.
- **[Users who liked the clamp for scanning.]** → There's no setting, so the interface stays small. Revisit only if feedback asks.

## Open Questions

- Should the notes be capped with an inner scroller anyway, as literally requested, at the cost of exceeding the three-scroll-region budget? The design says no, for D2's reasons. If the product decision is yes, the budget requirement needs an explicit exception, and that would change the spec delta.
