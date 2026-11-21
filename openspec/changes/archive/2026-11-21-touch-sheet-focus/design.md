# Design

## Context

Focus on open is decided in three places today:

- **The overlay primitive.** `useOverlay` (Dialog, Popover and through it Menu) calls `focusInto(panel)` (`web/src/ui/overlay/stack.ts`) in its mount effect and again in the next frame: nothing if focus is already inside, else the first `[autofocus], [data-autofocus]` element, else the first focusable that is not the Close button, else the panel (`tabIndex={-1}`, with the role and the name).
- **React's `autoFocus`.** It focuses during commit, before the overlay's effect, so `focusInto` finds focus inside and does nothing. About 130 call sites; most are name and text fields of sheets that exist to type in.
- **Content effects.** `WhenControl` focuses the first input of the shown segment on mount and at every segment switch; `StarterList` focuses its search.

The label picker is a `ComboboxPanel`, whose field has `autoFocus` and `data-autofocus`. The When sheet's date field is focused by `WhenControl`'s effect.

`touch-keyboard-hints` already answers "can a key be pressed here": the stylesheet's `@media not ((any-pointer: fine) or (any-hover: hover))` plus `data-keyboard` on the root, set by `keyboardSeen.ts` at the first press an on-screen keyboard cannot make.

## Goals / Non-Goals

**Goals:** the keyboard stays down over a picker on a touch-only device; typing sheets and every device with a keyboard behave as today; focus is always inside an open overlay; one rule in the primitive, one definition of the signal.

**Non-Goals:** a preference; changing where focus goes with a keyboard; reworking the sheet's position above the keyboard.

## Decisions

### D1. The signal: the device, by the definition that exists

`web/src/lib/keyboardLikely.ts` holds the definition for scripts: `touchOnly()` is true when `matchMedia('(any-pointer: fine), (any-hover: hover)')` does not match and the root has no `data-keyboard`. The list form means the same as the stylesheet's `or` and is understood by browsers without the level 4 syntax; a test reads `index.css` and fails if the two drift. `KEYBOARD_ATTR` moves there; `keyboardSeen.ts` (still loaded lazily from `main.tsx`) imports and re-exports it. Where the question cannot be asked (no `matchMedia`, the server render) the answer is "a keyboard", so the fallback is today's behaviour.

The issue says "opened by touch on a device without a keyboard". The device answer covers the first half: on a touch-only device there is no other way to open a sheet, and a sheet opened by Enter on a focused button has, by that press, set `data-keyboard`. So no pointer type is tracked per open.

It is read when the overlay opens, not subscribed to: attaching a mouse while a sheet is open changes the next sheet.

Alternatives: the pointer type of the opening event (`pointerdown`), rejected: it would also quieten a touch laptop, where the keyboard is in reach and the on-screen one never shows. `navigator.virtualKeyboard`, `visualViewport` guessing, the user agent: rejected as in `touch-keyboard-hints` D1.

### D2. The rule lives in `focusInto`; a field opts in by asking

On a touch-only device `focusInto` focuses the panel instead of its entry element when that element raises the keyboard (`raisesKeyboard`: an `input` of a text type, a `textarea`, a contenteditable) and did not ask for focus. Asking is what typing sheets already do: `autoFocus` (React focuses it before the rule runs) or `data-autofocus`. That is the explicit opt-in for "this sheet is for typing", and it needs no edit in the sheets that have it.

A picker's field asks differently: `pickerField()` returns `{ autoFocus: !touchOnly(), 'data-autofocus': 'keyboard' }`. With a keyboard it is focused as before; without, `focusInto` treats it as not asking.

Why this direction and not a `typing` prop on Dialog and Popover with "never focus a field" as the default: there are about sixty typing sheets and six picker components. A forgotten prop would leave a rename prompt without its keyboard, a worse failure than a picker that still raises it, and the default that needs no edit is the one that keeps today's behaviour.

`trapTab` gains one case: Tab pressed while the panel itself has focus goes to the entry element (the field), not to the Close button that precedes it in the document.

### D3. Each overlay and its side of the rule

Waits for a tap on a touch-only device:

| Overlay | How |
| --- | --- |
| Label picker (list rows, Filter, a saved view, the panel's Labels), assignee picker, the panel's Project, Section, Parent task, Blocked by, time zone and custom field options, project picker field, completed options, Focus task pickers, a menu's picker steps (Move to project…), saved locations, the command bar's picker step, Delegate to, routine pickers, Merge label into, rotation people, Plan from | `ComboboxPanel`: `pickerField()` |
| `Combobox` as a phone sheet (inline label and assignee fields) | its field is `pickerField()` without `autoFocus` |
| Template picker, Add step search | `ComboboxField autoFocus="keyboard"` |
| Icon picker (project, section, view, workspace) | `pickerField()` |
| Keyboard cheat sheet search, routine starters search | `pickerField()`, `touchOnly()` |
| When popover: Do on, Start, Deadline date fields | `WhenControl` skips a field that raises the keyboard; the sheet focuses the calendar's current day |
| Schedule sheet | already opens on its first quick choice; unchanged |
| A dialog or popover whose first control is a text field without `autoFocus` (issue connection token, Edit label, the colour field's hex, Move this occurrence) | the rule itself |

Focuses its field everywhere (asks with `autoFocus` or `data-autofocus`; no edit): quick add (sheet, palette, Add on day, Catch, next action), the command bar's search, comment composers, `NamePrompt` (rename, new project, new view), new workspace, template, habit, frame and slot names, the query filter, Feedback, link and share fields, re-authentication, two-factor and unlock fields, token, app password, webhook, SMTP and calendar forms, the assistant's composer, the "Pick a date" dialogs (`DateField autoFocus`).

Not a text field, unchanged: confirmations (Cancel), menus (first item), the notification list, the calendar popover of a date field (the current day).

### D4. A picker that arrives later

`ComboboxPanel` focused its own field because it can mount in an overlay that is already open (a menu's second step, a dialog whose data arrived late). On a touch-only device it no longer does, and the menu items that had focus are gone, so focus would fall to the inert page. `restInOverlay(content)` moves it to the enclosing `[data-overlay]` panel in that case; `ComboboxPanel` and `IconPicker` call it on mount. With a keyboard it does nothing.

### D5. What stays as it is

- **The keyboard, once up.** `watchVisualViewport` still lifts a sheet by `--vv-bottom` and scrolls the focused field into view; the sheet now opens at its full height and shrinks only when the field is tapped.
- **iOS and gestures.** iOS raises the keyboard only for focus inside a user gesture. Nothing here depends on that any more: a typing sheet focuses during the tap as before, and a picker's field is focused by the person's own tap.
- **Focus return.** `captureFocus` is untouched; the trigger gets focus back.
- **Accessibility checks.** The panel has `tabIndex={-1}`, a role and a name, and no outline of its own; a focused panel is how an empty dialog already opens. The audit's Tab walk (M8, M17) and `scripts/ui-check/a11y.mjs` run with a fine pointer or after key presses, where nothing changes, and a panel is not a Tab stop.

## Data model, size, interface budget

No data model impact: no field, op, route or setting. No dependency; image size and memory unchanged. Entry chunk 145.3 KB gzip (budget 146 KB), entry with static imports 705.0 KB (budget 706 KB) after the change. The interface budget is untouched: no chrome, property, destination, scroll region or shortcut is added or removed.

## Risks / Trade-offs

- A form dialog whose first field did not ask for focus now needs one tap on a phone. Accepted: it is the same rule, and a form is read before it is typed in. A sheet that should type at once gets `autoFocus`.
- A phone with a Bluetooth keyboard and no pointer opens its first picker quietly; the first key press restores the old behaviour, as with the hints.
- The interface tour and the layout check open overlays with key presses, so their 360 px screenshots still show the focused field. They do not show what a finger gets.

## Open Questions

- The "Pick a date" dialogs (row swipe, bulk bar, Close the day) are one text field with the calendar behind a button, and still raise the keyboard. Showing the calendar at once would be a layout change of its own.
