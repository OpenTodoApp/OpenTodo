# Design: a wrapping line and notes under it

## D1. One field that wraps, sized without script

The field becomes a `textarea` with one row. Its tint layer (the soft hue behind recognised words) already mirrors the text in the same box, font and padding; it now sits in the same grid cell as the field instead of being positioned over it, wraps the same way (`pre-wrap`, `break-word`) and so sets the cell's height. The field stretches to the cell. The tint layer is capped at five lines plus padding; past that it clips and the field scrolls, and the layer follows the field's `scrollTop` as it followed `scrollLeft`. Nothing measures the field in script, so typing in a quick add above a 2,000-row list adds no forced layout (the reason the tint stopped reading the field's scroll on every render, list-rendering-at-scale). Scrollbars are hidden on the field so the two keep the same wrapping width.

Enter is handled by the field (a `textarea` does not submit its form): it calls `requestSubmit()`, so the send button, Enter and the old tests' `requestSubmit` share one path. A line break that reaches the title by paste into a non-empty field or by dictation is turned into a space, as the old `input` dropped it. A multi-line paste into an empty field is still the paste offer.

The `+`, the microphone and the shortcut hint sit in boxes one field-line tall (`1lh` of the field's text step plus its padding), aligned to the top, so they stay beside the first line.

## D2. Notes: Shift+Enter, or the phone's Notes tool

Shift+Enter in the line opens a second field under it, "Notes", and moves the caret there. The opening and the focus happen inside the key press or tap (`flushSync`, then `focus()`), so a phone keeps its keyboard up. In the notes, Enter adds the task (one rule: Enter adds, wherever the caret is), Shift+Enter is a line break, Escape leaves the field like the line's Escape, and Backspace in the empty field closes it and puts the caret at the end of the line. The notes field is sized like the line, by a hidden copy of its text, up to six lines.

The notes are the task's `description`, trimmed, passed with the parsed input; `createTask` already writes it in the task's first operation (the share screen does the same). They are never parsed: `tomorrow #work` in the notes stays text.

The phone's sheet has no Shift+Enter, so its tool row gets a Notes tool after the field tools, which opens the field (pressed while it is open). It cancels its mouse down like the other tools.

Two places keep their own meaning: the command bar's Add mode, whose Shift+Enter adds and opens the task (its notes are one step away on the page, and the key is printed in its footer), and the share screen, which has its own Description field (`notes={false}`).

The list's `o` insertion ended when the quick add's line lost focus; it now ends only when focus leaves the quick add's form, so moving into the notes keeps it.

## Interface budget

No chrome above the list is added: the notes field is inside the quick add element, under its line, and only while opened. The quick add's preview chips stay where they were. The sheet's tool row gains one 38 px tool; with the energy tool on, the row still fits 360 px. One shortcut entry is registered, `quickadd.notes` (Shift+Enter, local to the field, like the command bar's), with no conflict. No new scroll region: both fields scroll inside themselves only past their cap, as text fields do.

## Data model

None. `description` exists on tasks; quick add only fills it at creation.

## Size

No dependency. Two small components (`NotesLine`, `VoiceParts`, the latter moved out of `QuickAdd`), a few CSS rules; the quick add is in the first-load bundle, so `make bundle-budget` is checked.
