# Design

## Context

A sidebar row with a menu is a wrapper (`li[data-project-row]`, `[data-favourite-row]`, `[data-label-row]`, a view's row, a pinned note's row) around the row's `SidebarItem` button (a label's `[data-label-open]`) and its menu, an `ActionMenu` whose trigger gets `hover-reveal` or, with every count on, `ui-swap-menu`. With a fine pointer both hide the trigger until the row is hovered or focused; `ui-swap-menu` also puts it over the count's slot. Both do nothing on touch, so there the 44 px trigger stood in the flow of every row.

Task rows open their menu on a touch hold (`task-row-context-menu`, `holdForRow` and `trackHold` in `web/src/lib/dnd.ts`). Sidebar rows had no hold: a project row's drag (`beginDrag`) armed on a hold and a release without a move did nothing.

The foot is one flex row: the account control (`flex-1 min-w-10`), the assistant launcher, the bell and the sync control. The name was a `truncate` span. The sync button never narrowed (a button is as wide as its content), so long words pushed the row wider than the sidebar.

Measured on the seeded account, touch, before: the row `Home renovation with a rather long project name` showed 9 of 47 characters at 768 px, 17 at 360 px and 11 at 320 px; the favourite `Deep work and everything else that matters` 21, 29 and 23 of 42. The foot showed "Ada Lovelace" cut at 768 px and 320 px, whole at 360 px.

M11 at 360 px with the tree unfolded reported five pairs, each a row at the list's lower edge against a control of the foot. The row's box reaches 40 px below the scroller's (row 624 to 668, scroller ends at 628), and `elementFromPoint` there returns the foot's control: the list cuts the row, nothing is painted or tappable over the foot. So the layout is right and the rule is wrong.

## Goals / Non-Goals

**Goals:** on touch the name gets the width of the menu button; the menu stays reachable by touch, keyboard and screen reader; the foot never shows a few letters and an ellipsis; M11 reports only what a finger can meet. Nothing changes with a mouse.

**Non-Goals:** a right-click menu on sidebar rows; changing rows of the Labels and Views pages; the foot with a mouse; the chevron slot, members mark or count of a project's row.

## Decisions

### D1. The menu button stays, unpainted, at the end of the row

In `@media (pointer: coarse)`, inside the sidebar's scroller, a marked row (`data-menu-row`) is `position: relative` and its menu button is `position: absolute` at the row's end, 44 by 44 px. Without keyboard focus it has `opacity: 0` and `pointer-events: none`; with `:focus-visible` it shows, on the sidebar's colour, over the count. This is the mouse treatment (`ui-swap-menu`) with the hold in hover's place.

The button is never `display: none` or `visibility: hidden`, so it keeps its place in the Tab order and the accessibility tree, with a real box where a screen reader draws its cursor and where explore-by-touch finds it. A screen reader presses an element through its accessibility action, which clicks the element itself, so `pointer-events: none` does not stop it. The menu still anchors to the button, so from 768 px it opens at the end of the row as before; on a phone it is a sheet.

Alternatives. A narrower button (28 px): under the 44 px target, and the name still pays for it on every row. A visually hidden 1 px button (`sr-only`): a screen reader's cursor would be a dot, and the audit would count a 1 px target. Removing the button on touch and adding a custom accessibility action: the web has no such thing that TalkBack and VoiceOver both expose.

### D2. One hold handler on the scroller

`holdForRowMenu` (`web/src/app/rowMenuHold.ts`) is the scroller's `onPointerDown`. For a touch press on a row's own button inside a `data-menu-row` wrapper it follows the shared `trackHold`: the row gets `data-touch-hold` (the task row's tint) when the hold arms; a move past `DRAG_THRESHOLD` ends it; a release while armed swallows the click and presses the row's menu button on the next tick, after the swallow has let go. A press on a destination, a group heading or a fold arrow starts nothing.

One delegated handler serves every kind of row, so a new row only needs the marker. A project row keeps `beginDrag` on its `li`: both follow the same press with their own `trackHold`, which is built for two holders. A hold and a move lifts the drag and ends this hold; a hold and a release was nothing in `beginDrag` and is now the menu.

Alternative: `onHoldRelease` of `beginDrag` for projects and a separate hold for the other rows. Rejected: two paths for one gesture, and each menu would need a controlled `open`.

### D3. `ui-whole`: whole or not at all, in CSS

On a coarse pointer `.ui-whole` is a wrapping flex box one line high (`height: 1lh; overflow: hidden`) with a zero-width strut as its first item. The text is its second item and cannot shrink: when it fits it sits on the first line, when it does not it wraps to a second line, which is cut off. No script, no measuring, and it follows a resized sidebar, a longer translation and larger text by itself. With a fine pointer the class sets nothing and the span is the `truncate` it was. The text stays in the DOM, so the control's accessible name is unchanged.

The account name and the sync words both use it.

### D4. The sync control on touch

- A running sync shows no words on touch (`pointer-coarse:hidden` on the words while the state is `syncing`): the dot pulses. Otherwise the name in a phone drawer would leave and come back with every sync. `app-shell` "Sync status is quiet" already asks for words only while offline, on error or with changes pending.
- The other states keep their words where they fit whole. For that the control must be able to narrow: on touch the button is as wide as its wrapper (`pointer-coarse:w-full`) and the wrapper keeps 44 px (`pointer-coarse:min-w-11`). The words keep the room first, as before (the account control's basis is 0): they show only when something needs attention.
- Where the words do not fit, the control keeps the room that was left and shows the dot at its start. The name does not get that room back. Giving it back needs script; the case is a long state in a narrow sidebar, where the name would not fit either.
- A sync error keeps its words and its two-line detail.

### D5. M11 compares what a finger can meet

`overlaps()` cuts each control's box to every scroll container around it (`overflow` auto, scroll, hidden or clip), stopping at a fixed ancestor, which no scroller cuts. Two boxes are compared after that, and the hit test runs at the centre of what is left.

In a phone drawer everything is inside one fixed element, so the rule compared the drawer's stuck group heading with the rows scrolling under it. The rule now knows which element pins a control (the nearest fixed or stuck ancestor) and skips a pair when one is in a stuck element and the other scrolls under it inside the same pinned layer. Two stuck or two fixed controls on each other stay an overlap, and so does a row painted over the bar under its list.

The layout check's touch-target rule (`smallTargets`) reports a target that is invisible until hovered. A control with `pointer-events: none` takes no taps, so it is not a touch target and the rule leaves it out; an invisible control that does take taps still fails.

### Data model, size

No data model impact: no field, op, route, setting or string. No dependency. The first load grows by one small module and a few CSS rules; `node scripts/bundle-budget.mjs` stays inside the budget. No effect on the container image or memory.

### Interface budget

No row of chrome, task property, destination, scroll region or shortcut is added. The sidebar loses one control per row on touch.

## Risks / Trade-offs

- The hold is not visible before it is used. It is the gesture task rows already teach, the tint answers it, and `docs/sidebar-counts-and-order.md` names it. A user who never finds it still has each row's page, whose header menu holds the same items.
- VoiceOver and TalkBack were reasoned, not run: both press through the accessibility action, which reaches an unpainted button. It needs the owner's check on a phone.
- After a menu opened by a hold closes, focus returns to its button. If a browser treats that focus as keyboard focus, the button shows until focus moves. Chromium does not after a touch.
- On a tablet the foot is the avatar, the two icons and the dot most of the time; the name is one tap away in the account menu's title.
