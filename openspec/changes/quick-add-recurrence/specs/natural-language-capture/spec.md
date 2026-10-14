# Spec Delta

## ADDED Requirements

### Requirement: Recurrence phrases
The parser SHALL recognise a recurrence phrase in the quick-add line and SHALL store it as the canonical English rule of the recurring-tasks grammar. Phrases SHALL cover every pattern of that grammar: `every [N] day|week|month|year`, weekday lists, `every weekday`, a day of month, `last day`, `last weekday`, an ordinal weekday, `after completion`, `until <date phrase>` and `for N times`, plus one-word forms (`daily`, `weekly`, `monthly`, `yearly`). The phrase SHALL be removed from the title. A phrase the grammar cannot express SHALL stay in the title.

#### Scenario: Weekday rule
- **WHEN** the user enters `Water plants every Monday`
- **THEN** the task's title is `Water plants` and its rule is `every monday`

#### Scenario: Completion-relative rule with an interval
- **WHEN** the user enters `Change filter every 3 days after completion`
- **THEN** the rule is `every 3 days after completion`

#### Scenario: Ordinal weekday with an end date
- **WHEN** today is 2026-10-09 and the user enters `Board meeting every 2nd Tuesday until 31 Dec`
- **THEN** the rule is `every 2nd tuesday until 2026-12-31`

#### Scenario: One-word form
- **WHEN** the user enters `Standup daily at 9:30`
- **THEN** the rule is `every day` and the task is due at `09:30`

#### Scenario: Unsupported phrase stays literal
- **WHEN** the user enters `Check logs every 3 hours`
- **THEN** no rule is set, no recurrence chip is shown and the title is `Check logs every 3 hours`

#### Scenario: Only the first rule counts
- **WHEN** the user enters `Pay rent every month every 1st`
- **THEN** the rule is `every month` and the title is `Pay rent every 1st`

### Requirement: Recurrence sets the first occurrence
When the line carries a rule and no date phrase, the task's due date SHALL be the rule's first occurrence on or after today, computed locally, and the recurrence chip SHALL show that date. When the line carries a date, that date SHALL be the due date and the rule applies from it; a time in the line SHALL be the series' due time. The rule and the due date SHALL be written in the same operation set as the task.

#### Scenario: First occurrence from today
- **WHEN** today is Friday 2026-10-09 and the user enters `Water plants every Monday`
- **THEN** the task is due `2026-10-12` and the chip reads the rule with that date

#### Scenario: Typed date anchors the series
- **WHEN** today is 2026-10-09 and the user enters `Invoice every month 3 Nov at 10:00`
- **THEN** the task is due `{date: "2026-11-03", time: "10:00"}` with the rule `every month`

#### Scenario: View default does not override the rule's date
- **WHEN** the user enters `Review every Friday` in the Today view on a Wednesday
- **THEN** the task is due on Friday, not today

### Requirement: Reminder phrases
The parser SHALL recognise reminder phrases introduced by a reminder word (`remind me`, `erinnere mich`, `rappelle-moi`, `ricordamelo`, `recuérdame`, `lembre-me` and documented variants) followed by either an offset (`30 min before`, `1 hour after`, `2 days before`) or a moment (a time phrase, optionally with a date phrase). A line MAY carry several reminder phrases; each SHALL become one reminder and one chip. A reminder word with neither an offset nor a moment SHALL stay in the title.

#### Scenario: Offset before the due time
- **WHEN** the user enters `Dentist tomorrow at 15:00 remind me 30 min before`
- **THEN** the title is `Dentist`, the task is due tomorrow at `15:00`, and one relative reminder with offset −30 minutes is created

#### Scenario: Two reminders
- **WHEN** the user enters `Flight 3 Nov at 06:00 remind me 1 day before remind me 2 hours before`
- **THEN** two relative reminders are created, with offsets −1440 and −120 minutes, and two chips are shown

#### Scenario: Reminder word alone stays literal
- **WHEN** the user enters `Email Sarah to remind me`
- **THEN** no reminder is created and the title is `Email Sarah to remind me`

#### Scenario: German reminder
- **WHEN** the browser language is `de` and the user enters `Zahnarzt morgen um 15 Uhr erinnere mich 30 Minuten vorher`
- **THEN** the task is due tomorrow at `15:00` with a relative reminder of −30 minutes

### Requirement: Reminder moments resolve against the due date
A moment reminder (`remind me at 9`, `remind me tomorrow at 9`) SHALL be resolved after the view's defaults are applied. If the task then has a due date, the reminder SHALL be relative, with its offset the whole number of minutes from the due time (09:00 for a date-only due) to the moment, whose date defaults to the due date. If the task has no due date, the reminder SHALL be absolute at that moment in the device's time zone, with the date defaulting to today, or tomorrow when the moment has already passed.

#### Scenario: Moment on a timed task becomes relative
- **WHEN** the user enters `Dentist tomorrow at 15:00 remind me at 9`
- **THEN** one relative reminder with offset −360 minutes is created, so moving the task to another day moves the reminder with it

#### Scenario: Moment on a date-only task
- **WHEN** the user enters `Pay rent 3 Nov remind me at 8`
- **THEN** one relative reminder with offset −60 minutes is created, because a date-only due counts as 09:00

#### Scenario: Moment on an undated task
- **WHEN** it is 10:00 and the user enters `Call mum remind me at 9` in the Inbox
- **THEN** the task has no due date and an absolute reminder is created for tomorrow at 09:00 local time

#### Scenario: Moment with its own date on an undated task
- **WHEN** today is 2026-10-09 and the user enters `Book tickets remind me 20 Oct at 9` in the Inbox
- **THEN** an absolute reminder is created for 2026-10-20 09:00 local time and the task has no due date

#### Scenario: Offset without a due date
- **WHEN** the user enters `Prepare slides remind me 1 day before` in the Inbox
- **THEN** a relative reminder with offset −1440 is created with no firing time, the chip says it needs a due date, and the reminder fires once the task gets one

#### Scenario: View default supplies the due date
- **WHEN** the user enters `Call mum remind me at 9` in the Today view
- **THEN** the task is due today and the reminder is relative, offset 0, because the view's default due is applied before the reminder is resolved

## MODIFIED Requirements

### Requirement: Multi-language vocabulary
Date, time, recurrence and reminder vocabulary SHALL be bundled for English, German, French, Italian, Spanish and Portuguese and SHALL be available with no network. The active set SHALL be the browser's preferred languages that are bundled, with English always active, and SHALL be overridable in Settings. Attribute tokens (`#`, `@`, `p1`–`p4`, `+`) SHALL be language-independent. The stored rule SHALL always be the canonical English form, whatever language the phrase was typed in.

#### Scenario: German phrase
- **WHEN** the browser language is `de` and the user enters `Zahnarzt nächsten Mittwoch um 15 Uhr`
- **THEN** the task is due next Wednesday at `15:00` with title `Zahnarzt`

#### Scenario: English always works
- **WHEN** the browser language is `it` and the user enters `Pay rent tomorrow`
- **THEN** the task is due tomorrow with title `Pay rent`

#### Scenario: Unsupported language falls back
- **WHEN** the browser language is one with no bundled vocabulary
- **THEN** English vocabulary is active, attribute tokens still work, and no error is shown

#### Scenario: Recurrence in each language
- **WHEN** the user enters `jeden Montag`, `tous les lundis`, `ogni lunedì`, `cada lunes` or `toda segunda-feira` after a title, with that language active
- **THEN** the rule is `every monday` in every case

#### Scenario: French interval with completion
- **WHEN** the browser language is `fr` and the user enters `Changer le filtre tous les 3 jours après achèvement`
- **THEN** the rule is `every 3 days after completion` and the title is `Changer le filtre`

#### Scenario: Reminder in each language
- **WHEN** the user enters `rappelle-moi 30 min avant`, `ricordamelo 30 minuti prima`, `recuérdame 30 minutos antes` or `lembre-me 30 minutos antes` after a timed task, with that language active
- **THEN** a relative reminder with offset −30 minutes is created in every case

### Requirement: Live preview chips
While the user types, the client SHALL show one chip per recognised attribute (due, project, label, priority, estimate, recurrence, reminder) below the input and the title as it will be saved. A recurrence chip SHALL show the canonical rule and, when no date was typed, the first occurrence; a reminder chip SHALL show the offset or the moment in the user's date and time formats, or say that it needs a due date. The preview SHALL update on every keystroke without noticeable delay and SHALL be announced to assistive technology without stealing focus.

#### Scenario: Chips appear as tokens are typed
- **WHEN** the user has typed `Buy milk tomorrow p2`
- **THEN** a due chip reading tomorrow's date and a priority chip reading `P2` are shown, and the title preview reads `Buy milk`

#### Scenario: Chips disappear when text changes
- **WHEN** the user deletes `p2` from the line
- **THEN** the priority chip disappears and the task would be created with priority 4

#### Scenario: Recurrence and reminder chips
- **WHEN** today is Friday 2026-10-09 and the user has typed `Water plants every Monday remind me at 8`
- **THEN** a recurrence chip reads `every monday · Mon 12 Oct`, a reminder chip reads `1 hour before`, and the title preview reads `Water plants`

#### Scenario: Dismissing the recurrence chip keeps the text
- **WHEN** the user dismisses the recurrence chip, or presses Backspace twice with the caret at the end of `Water plants every Monday`
- **THEN** the title is `Water plants every Monday`, no rule is set, and the chip does not reappear while that text is unchanged

#### Scenario: Quoted phrase is not a reminder
- **WHEN** the user enters `Read "remind me at 9" essay`
- **THEN** no reminder is created and the title is `Read remind me at 9 essay`

### Requirement: Deterministic and offline parsing
Parsing SHALL be a pure function of the line, the reference date and time, the active languages and the project list, with no network access and no randomness, so the same input yields the same result on every device. The created task, its rule and its reminders SHALL be written as one local operation set that is visible immediately, syncs when a connection exists, and converges under the per-field last-writer-wins rule like any other edit; a relative reminder in that set SHALL carry the firing time computed from the due date in the same set.

#### Scenario: Offline capture
- **WHEN** the device is offline and the user enters `Water plants tomorrow #home`
- **THEN** the task is created locally with the parsed date and project, and uploads when the device reconnects

#### Scenario: Same result on every device
- **WHEN** the same line is parsed on two devices with the same local date, time, languages and projects
- **THEN** both produce identical title, due, project, labels, priority, estimate, rule and reminder offsets

#### Scenario: Offline capture with a rule and a reminder
- **WHEN** the device is offline and the user enters `Water plants every Monday remind me at 8`
- **THEN** the task, its rule, its due date and its reminder appear at once, survive a reload, and all upload in the next successful sync, never the task without the reminder

#### Scenario: Reminder of a recurring task carries over
- **WHEN** the task created from `Water plants every Monday remind me at 8` is completed on a device, and another device syncs
- **THEN** both show the next Monday's occurrence with the reminder firing at 08:00 that day
