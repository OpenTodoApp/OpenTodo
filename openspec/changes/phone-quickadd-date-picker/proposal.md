# Proposal

## Why

On a phone, quick add has no way to pick a date by touch (GitHub issue [#1624](https://github.com/OpenTodoApp/OpenTodo/issues/1624)). Dates are typed in words ("tomorrow"), which is quick for some but hard for others and unlike every native task app. The sheet's date tool was dead and has been removed (`quickadd-sheet-drop-date-tool`); this proposes a real one: a date tool that opens a picker and writes the chosen date into the line, so the parser stays the single source of truth.

It is a feature, so it waits for the end-of-November freeze; this is the design.

## What Changes

- The phone quick-add sheet's tool row gets a **date tool** again. Tapping it opens a compact date (and optional time) picker as a bottom sheet over the keyboard, the keyboard staying up.
- Picking a day (and optionally a time, or "no time") **inserts the date into the line as text** the parser already understands (an ISO date, or the words the quick-add guide shows), so the date chip, the preview and the saved task come from parsing exactly as a typed date does. Clearing the picker removes that date from the line.
- If the line already sets a due date, the tool opens the picker on that date and replaces it; the picker never adds a second date.
- Nothing about typed dates changes; the picker is an alternative entry point, offered only on the phone sheet.

## Design — for the owner/Lead

- **D1 — One source of truth.** The picker never sets `due` directly; it edits the line's text, and parsing produces the attribute. So the picker, typing and the chip can never disagree, and Undo/history are unchanged.
- **D2 — What it offers.** A month grid with quick rows (Today, Tomorrow, this weekend, next week), a time row (a few common times, a custom time, or None), and Clear. Due only for v1; deadline and start stay typed. (Decision: due only, or also deadline?)
- **D3 — Where it inserts.** It replaces the line's existing due span if there is one (found from the parse), else appends; it writes a form the parser round-trips (recommended: the localized words the guide teaches, so the line stays readable, with an ISO fallback). (Decision: words vs ISO in the line.)
- **D4 — Keyboard and focus.** The picker is a bottom sheet above the on-screen keyboard; the field keeps focus so the person can keep typing after. It is operable by keyboard and screen reader.
- **D5 — Scope.** Phone sheet only. The list line, the command bar and the capture screen keep typing (they have a keyboard and more room). No desktop change.

## Capabilities

### Modified Capabilities

- `natural-language-capture`: "Quick add tools on a phone" regains a date tool that opens a picker and writes the date into the line.

## Impact

- Web only: a date-picker sheet component, the date tool wired to it, and a helper that replaces or appends the line's due span from a picked date. Reuses the existing parser and date formatting; no new field, op, API or parsing-grammar change. Loads lazily with the sheet. A phone-only interaction test and a story.
- Waits for the freeze to lift and the owner's go-ahead; ends with a check on a real phone.
