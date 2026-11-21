# Proposal

## Why

On a phone, quick add has no way to pick a date by touch (GitHub issue [#1624](https://github.com/OpenTodoApp/OpenTodo/issues/1624)). Dates are typed in words ("tomorrow"), which is quick for some but hard for others and unlike every native task app. The sheet's date tool was dead and has been removed (`quickadd-sheet-drop-date-tool`); this proposes a real one: a date tool that opens a picker and writes the chosen date into the line, so the parser stays the single source of truth.

The freeze has ended early and the owner asked for it, so this change is built.

## What Changes

- The phone quick-add sheet's tool row gets a **date tool** again. Tapping it opens a compact date (and optional time) picker as a bottom sheet over the keyboard, the keyboard staying up.
- Picking a day (and optionally a time, or "no time") **inserts the date into the line as words** the parser already understands ("tomorrow", "Fri 28 Nov"), so the date chip, the preview and the saved task come from parsing exactly as a typed date does. Clearing the picker removes that date from the line.
- If the line already sets a due date, the tool opens the picker on that date and replaces it; the picker never adds a second date.
- Nothing about typed dates changes; the picker is an alternative entry point, offered only on the phone sheet.

## Design

- **D1 — One source of truth.** The picker never sets `due` directly; it edits the line's text, and parsing produces the attribute. So the picker, typing and the chip can never disagree, and Undo/history are unchanged.
- **D2 — What it offers.** The quick dates (Today, Tomorrow, This weekend, Next week), the month grid, a time row (No time of day, 09:00, 12:00, 17:00, 20:00, and a time field), and Clear. **Due only** (decided): deadline and start stay typed.
- **D3 — Where it inserts.** It removes the line's existing due date (the spans the parse read it from) and appends the new one. The line shows **words** (decided): today and tomorrow by their word, later days as weekday, day and month ("Fri 28 Nov"), with the year only when needed, and a time as `HH:MM`, all in the line's first parsing language. Each worded form is kept only when parsing it gives the picked date back, so the line never says something the parser reads differently; where no worded form reads back (a language without bundled words), the ISO date is written. The task stores the ISO date as always.
- **D4 — Keyboard and focus.** The picker opens inside the sheet, above the chips, so it sits above the on-screen keyboard; taps cancel the mouse down, so the line keeps focus and the keyboard stays up. The quick dates and times are radio groups, the month is the panel's calendar grid, and the date tool reports `aria-expanded`. It is offered only while recognition is on (otherwise a written date would not be read). An emptied line (after an add) closes it.
- **D5 — Scope.** Phone sheet only. The list line, the command bar and the capture screen keep typing (they have a keyboard and more room). No desktop change.

## Capabilities

### Modified Capabilities

- `natural-language-capture`: "Quick add tools on a phone" regains a date tool that opens a picker and writes the date into the line.

## Impact

- Web only: `LineDatePicker` (the picker and its hook) in the sheet, the date tool in `SheetBar`, and `lib/nlp/lineDue.ts`, which words a due date and replaces the line's. Reuses the parser, `quickChoices`, `CalendarGrid` and existing strings; no new field, op, API, string or parsing-grammar change. Interaction tests in the sheet test, unit tests for the wording in every bundled language, and a story.
