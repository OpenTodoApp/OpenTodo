# Tasks

## 1. The picker (after the freeze)

- [ ] 1.1 A compact date/time picker bottom sheet (month grid, quick rows, a time row with None, Clear), above the keyboard, keyboard- and screen-reader-operable.
- [ ] 1.2 A helper that, from a picked date/time, replaces the line's existing due span (from the parse) or appends one, in a form the parser round-trips.
- [ ] 1.3 Wire a date tool in the phone sheet's tool row to open the picker; it opens on the line's current due when set.

## 2. Release

- [ ] 2.1 Docs: the phone quick-add help notes the date tool. Verify: `make docs-check`.
- [ ] 2.2 Changelog fragment. Verify: `make repo-check`.
- [ ] 2.3 Device check on a real phone.
