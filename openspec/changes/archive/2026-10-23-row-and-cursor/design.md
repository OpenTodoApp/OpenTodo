# Design

## Context

- `FullRow` in `web/src/app/TaskRow.tsx` renders a list row or a board card as an `<li data-task-id>` whose only click target for opening is one `<button data-row-open>` (title and metadata line). The `<li>` has `onPointerDown` (drag and swipe) and no `onClick`, so the rest of the row is inert. The click-away handler (`task-list/useClickAway.ts`) skips anything inside `[data-task-id]`, so an empty-area click does not even clear the selection.
- `onOpen(e)` goes to `useListBindings.open`, which first tries `startInline(id, e)` (edit in place: a mouse click, fine pointer, 768 px or wider, the "Edit in place" preference, no panel open, an editable task) and otherwise selects the row and opens the panel. `startInline` returns `false` when it gets no event.
- Drags and swipes already swallow the click the browser fires after them: `lib/dnd.ts` (after a drop or a released hold) and `app/rowSwipe.ts`.
- Tailwind 4's preflight sets `cursor: default` on buttons. `web/src/index.css` has no base cursor rule; about 24 components add `cursor-pointer` by hand.
- `EmptyState` in `task-list/ListChrome.tsx` maps each list view to a sentence and an action; eight list views use `action: 'add'`, which focuses the view's own `QuickAdd` (rendered above every list except Completed) or opens the quick-add sheet on a touch device.

## Decisions

### D1. The row's empty area opens the panel, through the existing open path without an event

The `<li>` of a full row gets an `onClick`. It ignores clicks whose target is inside an interactive element of the row (`button, a, input, label, select, textarea, [role=button], [role=menuitem], [contenteditable=true]`, searched with `closest` and bounded by the row), so the title button, the checkbox, the chevron, the selection box, the links and the action cluster keep their own handlers. Otherwise it calls `onOpen()` with no event: `startInline` then declines (no event), so the list selects the row and opens the panel under either setting and on any pointer. Shift and Ctrl/⌘ tick the row instead, as on the title.

- A drag or a swipe never reaches this handler: the click that follows them is already swallowed (`dnd.ts`, `rowSwipe.ts`).
- The inline editor's row (`inline` set) and a departing row get no handler.
- Board cards use the same `FullRow`, so a click on a card's padding opens it too; boards never edit in place, so nothing changes for the title there.
- Every caller of `TaskRow` gets the behaviour through its own `onOpen` (lists, boards, the dashboard, Close the day, the review screens), and each already opens the task from `onOpen()`.
- Keyboard: the `<li>` stays unfocusable and gains no key handler. The open button keeps Enter, so nothing changes for keyboard users. The handler is a pointer convenience over an area that already has a keyboard path, which is why the jsx-a11y rule for click handlers without key handlers is disabled on that line with that reason.

Alternative rejected: making the whole row one button (or `role=button`). It would nest the checkbox, links and actions inside a button (invalid) and change what screen readers announce for every row.

### D2. One base cursor rule at zero specificity

```css
@layer base {
  :where(button:not(:disabled), [role="button"]:not([aria-disabled="true"]), [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="tab"], [role="option"], summary, label[for], a[href], li[data-task-id]) { cursor: pointer; }
}
```

`:where()` keeps specificity at zero and the base layer sits below utilities, so `cursor-grab` (draggable calendar blocks), `cursor-not-allowed` (disabled buttons), `cursor-text` and `cursor-progress` still win. Disabled buttons are excluded by the selector. A task row shows the hand because its empty area now opens it (D1). Inputs and text fields keep their own cursors.

A style lint (`cursorDefault` in `web/src/ui/tokens/styleLint.ts`, run by `make ui-lint` and pinned in `lint.test.ts`) fails on `cursor-default` or `cursor-auto` in `web/src` unless that line or the one above carries `cursor-lint-allow` with a reason, and a token test checks the base rule is present. Hand-added `cursor-pointer` on elements the rule covers (buttons, `label[for]`-less labels wrapping a control are kept, `role=button`, `summary`) is removed; it stays where the element is a plain `div` or `span` with a click handler that the selector cannot see.

### D3. List empty views drop the "Add a task" button

The `'add'` action of `EMPTY_COPY` is removed: those eight views keep their sentence, illustration and secondary link, and have no primary button. Assigned and a read-only project keep "Open Inbox", Completed keeps "Open Today". The "Add a task" buttons that add somewhere specific are untouched: `BoardView` (an empty column's own quick add), `MonthView`, `WeekAgenda` and `PlanAgenda` (an empty day), and `FirstDay` (the onboarding checklist).

The `q` shortcut still focuses the quick add (or opens the sheet on touch), so the empty view loses nothing a keyboard user had: the button's tooltip "Press q" was the only place the key was shown in that view, and the quick-add field's own placeholder and the shortcut list keep it.

## Data model, sync and size

No data model, sync or API change. No dependency; the web bundle shrinks slightly (removed classes and one button path).

## Interface budget

Nothing is added above a list's first item; no task property, sidebar destination or scroll region is added; no shortcut is added or changed.

## Risks

- **Accidental opens.** A click meant to deselect, landing on a row's empty area, now opens that row. Deselecting is still a click on the column's empty space, Esc, or a click outside the list.
- **Selecting text in a row's metadata.** The metadata line is inside the open button already, so this was never possible; nothing changes.

## Open Questions

None that change what gets built.
