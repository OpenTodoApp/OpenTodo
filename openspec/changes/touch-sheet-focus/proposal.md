# Proposal

## Why

On a phone, a sheet that holds a text field focuses it as it opens, and the on-screen keyboard comes up over what the person opened the sheet for. The When sheet selects its date field and the keyboard covers the calendar; the label picker focuses "Type to find or create a label…" and the keyboard covers the labels (GitHub issue [#1360](https://github.com/OpenTodoApp/OpenTodo/issues/1360), found by the interface tour at 360 px). The person has to dismiss the keyboard before they can tap a day or a label.

Focusing the field is right where a key can be pressed: type "fri", press Enter. On a phone the choices are the faster way, and the field is one tap away for whoever wants it.

## What Changes

- **A picker opens with its choices in view.** On a device without a keyboard, a sheet or popover whose content is a list or a calendar (the When sheet, the label, assignee, project, section, parent, time zone and icon pickers, every `ComboboxPanel`, the cheat sheet) no longer focuses its text field on open. Focus still moves into the sheet, so a screen reader announces it and Escape and Back close it; the next Tab stop is the field; a tap on the field focuses it and brings the keyboard.
- **A field that is merely first waits too.** A dialog whose first control happens to be a text field, and that did not ask for focus there, opens with focus on the dialog.
- **A sheet for typing still focuses its field.** Quick add, the command bar, a comment, a rename or name prompt, a sign-in or confirmation field: a field marked `autoFocus` or `data-autofocus` is focused on every device, as today.
- **With a keyboard nothing changes.** On a computer, on a phone or tablet with a mouse or trackpad, and after the first hardware key press, every sheet focuses what it focused before.
- **One definition of "no keyboard".** `touch-keyboard-hints` answers the question in the stylesheet and in `keyboardSeen.ts`. The answer moves to `web/src/lib/keyboardLikely.ts` (`touchOnly()`), read by the overlay primitive; the hints rule and the detector are unchanged.

Out of scope: the "Pick a date" dialogs of a row swipe, the bulk bar and Close the day (one text field with a calendar behind a button; they stay typing sheets, see the design's open question); fields focused outside an overlay (the Projects page's find field already asks for a fine pointer); how a sheet sits above the open keyboard (`watchVisualViewport`, unchanged); the native shells; the interface tour's screenshots, which open overlays with key presses and so keep showing the focused field.

Advances the ROADMAP item "Shells that feel native".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-app`: a new requirement for what takes focus when a sheet opens on a device without a keyboard.

## Impact

- `web/src/lib/keyboardLikely.ts` (new; `KEYBOARD_ATTR` moves there from `keyboardSeen.ts`, which re-exports it), `web/src/ui/overlay/stack.ts` (`focusInto`, `trapTab`, `pickerField`, `restInOverlay`).
- `web/src/ui/Combobox/Combobox.tsx`, `web/src/ui/IconPicker.tsx`, `web/src/app/task-detail/WhenControl.tsx`, `web/src/app/ShortcutHelp.tsx`, `web/src/app/notes/TemplatePicker.tsx`, `web/src/app/routines/AddStep.tsx`, `web/src/app/routines/Starters.tsx`.
- No data, op, route, setting or string changes. No dependency. Entry chunk 145.3 KB gzip of 146 KB after the change.
- No UI screenshot baseline changes: the workbench and the tour run with a fine pointer or open overlays by key press, where nothing changes.
