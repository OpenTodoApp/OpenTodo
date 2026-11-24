# Proposal

## Why

Quick add on the web is built for typing (`tomorrow`, `fri 3pm`, `3 Feb`). People who think in days rather than words have no calendar to pick from there; only the phone's sheet has one (issue #1964, discussion #1451).

## What Changes

- **The quick-add palette:** editing the **When** row (a click, or Tab on the highlighted row) opens the same date picker as the phone's sheet under the rows: quick dates, the month, a row of times and Clear. Typing a date keeps working as before.
- **Quick add in a list (the line):** a calendar button beside the field opens the same picker under the line.
- **A pick writes the date into the line as words**, exactly as on the phone, so the date chip and the saved task come from parsing as a typed date does, and it replaces the line's existing date. Clear removes it. The picker keeps the focus in the field on a click and is reachable with the keyboard.
- **The picker is offered only while recognition is on**, as on the phone.

## Capabilities

### Modified Capabilities

- `natural-language-capture`: a new requirement, "A calendar in quick add on the web".

## Impact

- `web/src/app/QuickAdd.tsx` (the When row and the line's calendar button open `LineDatePicker`), `web/src/app/quickadd/LineDatePicker.tsx` (an `open` action), the message catalogs, a component test, `docs/` (the quick add guide).
- No server, sync or API change.
