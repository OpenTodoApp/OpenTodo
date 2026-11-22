# Suggest ticked items while typing in a reusable list

## Why

#1839 (dpaoliello): bringing back something you bought before is the everyday use of a reusable list. Typing an item's full name already reopens it, but to reach it with a few letters you have to scroll the ticked group or search.

## What Changes

- In a reusable list's quick add (the list's own line and a section's add row), typing two or more letters lists the ticked items whose name contains them, the most recently ticked first, at most eight. It uses the same name matching as an add (case, accents and spaces at the ends are ignored) and lists exactly the items an add would reopen: one per name, none whose name is open, no occurrence records.
- Nothing is chosen until ↓ or ↑ moves into the list (hovering only highlights), so Enter still adds what was typed. Enter on a chosen item, or a click, adds the line with that item's exact name, which reopens it as today: in its section, with its notes, the line's tokens ("milk p1" gives it priority 1), "Milk is back on the list" and Undo. Esc closes the list and keeps the text. The list shows only while the field has focus.
- While a `#`, `@`, `~` or priority suggestion is open, it takes precedence.

## Out of scope

- Choosing the order of the suggestions (alphabetical, most often reused).
- Suggestions in other projects, or of open items.
- The phone's add sheet (the floating add button), which adds to the current view without a list's own quick add; a follow-up can pass it the list.

No new string, field, route, op or environment variable. Reads the device's own rows, so it works offline and on decrypted titles.
