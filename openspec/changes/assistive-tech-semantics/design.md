# Design

## D1. Visually hidden text, not names on spans

`aria-label` works on elements whose role supports a name (buttons, links, images, regions, groups). On a generic `<span>`/`<div>` it is prohibited and ignored. The chips therefore render the abbreviated text with `aria-hidden="true"` and the full phrase in a `.sr-only` span beside it (`ReadAs`). The wrapper is `position: relative` so the absolutely positioned hidden text is contained by the chip and never widens a scroller it sits in (a board column; the Chromium layout check caught this, see issue #95). Elements whose name describes a container get the role instead (the audit table's scroller is a `region`, a calendar lane a `group`, the toast area a `region`). The local ESLint rule keeps the pattern from coming back; it is a few lines of AST matching in `web/eslint/`, so no plugin is added.

## D2. Real focus for the cursor, attributes for the hierarchy

Two options exist to expose a cursor that moves without Tab: `aria-activedescendant` on a focused container, or moving focus. `aria-activedescendant` needs the container focused and option or treeitem roles on the rows, and those roles may not contain the row's buttons (complete, chevron, select). Moving focus to the row's existing open button needs no new roles: a screen reader reads the button, whose content is the title plus the now-announced chips. The list's selection effect moves focus only when the page has no focus or focus is already on a row of this list (and not in a text field), so focus is never taken from the panel, a dialog, the quick add or the sidebar. Enter on the focused button opens the task (the "open" shortcut already stands back for a focused button), Space is still taken by the tick shortcut, and focus return from overlays now lands on the row that opened them. No row prop changes when the cursor moves beyond the existing `selected` boolean, so the memoized rows still re-render two rows per press.

Hierarchy: `aria-level`, `aria-posinset` and `aria-setsize` are valid on `listitem` and need no other change; they are computed once per grouping (`siblingPos`) and set only in the tree views (project, Inbox). A tree or grid role was not used: it would require focus management on the rows themselves (D2 above) and would conflict with Tab as the indent key.

## D3. Page announcements

The shell watches its main area: `document.title` follows the page's level-one heading (the header title, or the phone bar's title below 768 px), also when its text arrives later from the database. After a route change it waits for the heading and focuses it with `tabindex="-1"`, unless focus is in a dialog, an overlay or the task panel, in a text field, or the new page moved focus into itself (Settings' requested row, the list's cursor row). The first load is excluded, and so is any navigation before the person has used the page (the start-view redirect), via the User Activation API (`navigator.userActivation.hasBeenActive`), so no extra keydown listener is installed (keyboard-shortcuts keeps one listener). The skip link is the first focusable element, visible on focus.

## Interface budget

Nothing visible is added except the skip link, which appears only while focused and above the page; no chrome row, property, sidebar destination, scroll region or shortcut is added.

## Data model, size, memory

No data model change. Bundle impact: under 1 kB minified (one hook, one component, attributes). No dependency.
