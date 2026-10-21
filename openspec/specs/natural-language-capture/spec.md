# natural-language-capture Specification

## Purpose
Defines how a single quick-add line is parsed into task attributes: the token grammar, date and time resolution, multi-language vocabulary, the live preview, how the user overrides the parser, and the guarantee that parsing is deterministic and works offline.

## Requirements

### Requirement: Attribute tokens
The quick-add line SHALL recognise `#<name>` as a project reference, `@<name>` as a label, `p1`–`p4` as a priority (1 highest, 4 lowest) and `+<duration>` (`+30m`, `+2h`, `+1h30`) as a duration estimate in minutes. A `#` token SHALL match a non-archived, non-deleted project by case-insensitive name, exact match first and unique prefix second; a token that matches no project SHALL stay in the title unchanged. Recognised tokens SHALL be removed from the title and surrounding whitespace collapsed.

#### Scenario: Full line
- **WHEN** the user enters `Meeting with Sarah #work @call p1 +30m` and a project named "Work" exists
- **THEN** the created task has title `Meeting with Sarah`, project "Work", labels `["call"]`, priority 1 and estimate 30 minutes

#### Scenario: Unknown project token stays literal
- **WHEN** the user enters `Read #ambiguous` and no project name starts with "ambiguous"
- **THEN** the title is `Read #ambiguous` and the task goes to the context's default project

#### Scenario: Ambiguous prefix is not guessed
- **WHEN** projects "Home" and "Homework" exist and the user enters `Fix sink #hom`
- **THEN** the token is not resolved, the title keeps `#hom`, and the preview shows no project chip

### Requirement: Date and time phrases
The parser SHALL recognise relative day words, weekday names with an optional "next", "in N days/weeks/months", "next week/month", month-and-day and numeric dates, and 12-hour or 24-hour times optionally preceded by "at". Dates SHALL resolve against the viewer's local date, always to today or later, and a time without a date SHALL mean today. The result SHALL be stored as the floating `{date: "YYYY-MM-DD", time?: "HH:MM"}` due value.

#### Scenario: Next weekday with time
- **WHEN** today is Friday 2026-10-09 and the user enters `Dentist next Wed at 3pm`
- **THEN** the task is due `{date: "2026-10-14", time: "15:00"}` and its title is `Dentist`

#### Scenario: Time only
- **WHEN** the user enters `Call back 16:30` with no date phrase
- **THEN** the task is due today at `16:30`

#### Scenario: Date in the past rolls forward
- **WHEN** today is 2026-10-09 and the user enters `Renew passport 3 Feb`
- **THEN** the task is due `2027-02-03`

### Requirement: Numeric order and week start follow the preferences
While the device's numeric date order is automatic, numeric dates SHALL be read in the order of the user's date format (OpenSpec `date-time-preferences`; `iso` and `system` keep the language's order). "next week" and the "next <weekday>" rule SHALL use weeks that start on the user's preferred first day of the week.

#### Scenario: Numeric date follows the date format
- **WHEN** the browser language is English (US), the quick-add order is automatic, the date format is `day-month`, today is 2026-10-09, and the user enters `Pay rent 3/11`
- **THEN** the task is due `2026-11-03`

#### Scenario: Explicit quick-add order wins
- **WHEN** the device's quick-add numeric order is set to month-day and the date format is `day-month`, and the user enters `Pay rent 3/11` on 2026-10-09
- **THEN** the task is due `2027-03-11`

#### Scenario: Next week with a Sunday start
- **WHEN** the first day of the week is `sun`, today is Wednesday 2026-10-14, and the user enters `Plan trip next week`
- **THEN** the task is due Sunday `2026-10-18`

### Requirement: Multi-language vocabulary
Date, time, recurrence and reminder vocabulary SHALL be bundled for English, German, French, Italian, Spanish and Portuguese, available with no network. The active set SHALL be the interface language (OpenSpec `localization`) when not `system`, then the browser's bundled preferred languages, with English always active, overridable in Settings on the device. Attribute tokens (`#`, `@`, `p1`–`p4`, `+`) SHALL be language-independent. The stored rule SHALL always be the canonical English form.

#### Scenario: German phrase
- **WHEN** the browser language is `de` and the user enters `Zahnarzt nächsten Mittwoch um 15 Uhr`
- **THEN** the task is due next Wednesday at `15:00` with title `Zahnarzt`

#### Scenario: English always works
- **WHEN** the browser language is `it` and the user enters `Pay rent tomorrow`
- **THEN** the task is due tomorrow with title `Pay rent`

#### Scenario: Unsupported language falls back
- **WHEN** the browser language is one with no bundled vocabulary
- **THEN** English vocabulary is active, attribute tokens still work, and no error is shown

#### Scenario: Interface language comes first
- **WHEN** the browser language is `en-US`, the interface language is Spanish and the device has no language override
- **THEN** the active languages are Spanish then English, `Pagar alquiler mañana` is due tomorrow, numeric dates read day-month while the date format is `system`, and dictation listens in Spanish

#### Scenario: Device override still wins
- **WHEN** the interface language is Spanish and the device's quick-add languages are set to German only
- **THEN** the active languages are German then English

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
While the user types, the client SHALL show one chip per recognised attribute (due, project, label, priority, estimate, recurrence, reminder) and the title as it will be saved. The preview SHALL update on every keystroke and be announced without stealing focus. A link to the quick add guide SHALL appear beside the chips during the first three uses on a device and in the input's tooltip afterwards; no shortcut badge SHALL be printed unless shortcut hints are on.

#### Scenario: Chips appear as tokens are typed
- **WHEN** the user has typed `Buy milk tomorrow p2`
- **THEN** a due chip reading tomorrow's date and a priority chip reading `P2` are shown, and the title preview reads `Buy milk`

#### Scenario: Chips disappear when text changes
- **WHEN** the user deletes `p2` from the line
- **THEN** the priority chip disappears and the task would be created with priority 4

#### Scenario: Guide link fades out
- **WHEN** the user has added four tasks on this device
- **THEN** the guide link is no longer shown beside the chips and is available from the input's tooltip and the Help action

#### Scenario: Recurrence and reminder chips
- **WHEN** today is Friday 2026-10-09 and the user has typed `Water plants every Monday remind me at 8`
- **THEN** a recurrence chip reads `every monday · Mon 12 Oct`, a reminder chip reads `1 hour before`, and the title preview reads `Water plants`

#### Scenario: Dismissing the recurrence chip keeps the text
- **WHEN** the user dismisses the recurrence chip, or presses Backspace twice with the caret at the end of `Water plants every Monday`
- **THEN** the title is `Water plants every Monday`, no rule is set, and the chip does not reappear while that text is unchanged

#### Scenario: Quoted phrase is not a reminder
- **WHEN** the user enters `Read "remind me at 9" essay`
- **THEN** no reminder is created and the title is `Read remind me at 9 essay`

### Requirement: Dismiss and escape parsed tokens
The user SHALL be able to reject an interpretation: activating a chip's dismiss control, or pressing Backspace when the caret is at the end of the line and the last chip is highlighted, SHALL keep that text literally in the title and SHALL suppress re-parsing of that span until the span's text changes. Text inside double quotes SHALL never be parsed, and the quotes SHALL be removed from the saved title.

#### Scenario: Dismiss a false positive
- **WHEN** the user types `Review "may" report`, or types `Review may report` and dismisses the due chip for May
- **THEN** the title is `Review may report` and the task has no due date

#### Scenario: Dismissal survives further typing
- **WHEN** the user dismissed the due chip for `may` and keeps typing `... with Ana`
- **THEN** no due chip reappears for `may`

#### Scenario: Keyboard dismissal
- **WHEN** the caret is at the end of the line and the user presses Backspace twice
- **THEN** the first press highlights the last chip and the second press dismisses it, leaving the text unchanged

### Requirement: Deterministic and offline parsing
Parsing SHALL be a pure function of the line, the reference date and time, the active languages and the project list, with no network access or randomness, so every device gets the same result. The task, its rule and its reminders SHALL be written as one local operation set, visible at once, synced when online and converging per field like any edit; a relative reminder in it SHALL carry the firing time computed from the due date in the same set.

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

### Requirement: Per-device parsing toggle
Settings SHALL offer a switch that turns natural-language parsing off for the current device. With parsing off, quick add SHALL behave as a plain title field, the task panel's title and the inline title editor SHALL save the typed text as the title, and none of them SHALL show chips or token suggestions. The setting SHALL be stored only on the device and SHALL not sync.

#### Scenario: Parsing off
- **WHEN** parsing is switched off and the user enters `Buy milk tomorrow p2`
- **THEN** a task titled `Buy milk tomorrow p2` is created with priority 4 and the view's default due date

#### Scenario: Parsing off while editing
- **WHEN** parsing is switched off and the user appends ` tomorrow` to a task's title in the panel
- **THEN** the title ends with "tomorrow" and the due date is unchanged

### Requirement: Deadline phrases
The parser SHALL recognise the word `deadline`, or its bundled equivalent in each active language, directly before a date phrase, and SHALL set the task's deadline to that date instead of its due date. The date SHALL resolve by the existing rules (today or later), a time after it SHALL stay in the title, and the deadline SHALL get its own chip. `on`, `by` and `due` SHALL keep setting the due date. Only the first deadline phrase in a line SHALL count.

#### Scenario: Deadline only
- **WHEN** today is Wednesday 2026-10-14 and the user enters `Send report deadline friday`
- **THEN** the task is titled `Send report`, has no due date and the deadline `2026-10-16`, and a deadline chip is shown

#### Scenario: Plan and deadline
- **WHEN** the user enters `Send report tomorrow deadline friday` on 2026-10-14
- **THEN** the task is due `2026-10-15` with the deadline `2026-10-16`

#### Scenario: German phrase
- **WHEN** German is active and the user enters `Bericht Frist 3. November`
- **THEN** the task is titled `Bericht` with the deadline `2026-11-03`

#### Scenario: Dismissed chip
- **WHEN** the user dismisses the deadline chip of `Review deadline policy tomorrow`
- **THEN** the title keeps `deadline policy` and the task is due tomorrow with no deadline

### Requirement: Someday and evening phrases
The parser SHALL recognise `someday` and `tonight` / `this evening`, each with its bundled equivalent in every active language. `someday` SHALL park the task (start `someday`, no due date) and SHALL stay in the title when the line also has a date phrase. `tonight` and `this evening` SHALL make the task due today with the evening flag; a time still sets the due time. Each SHALL show a dismissable chip. The Someday view SHALL park a captured task unless the line sets a date.

#### Scenario: Park from quick add
- **WHEN** the user enters `Learn to sail someday @hobby`
- **THEN** the task is titled `Learn to sail`, parked, labelled "hobby", and a Someday chip is shown

#### Scenario: Someday with a date stays literal
- **WHEN** the user enters `Plan someday trip friday`
- **THEN** the task is titled `Plan someday trip`, due Friday and not parked

#### Scenario: Tonight with a time
- **WHEN** the user enters `Call Ana tonight at 8pm` on 2026-10-14
- **THEN** the task is due `{date: "2026-10-14", time: "20:00"}` with the evening flag set and the title `Call Ana`

#### Scenario: Italian evening
- **WHEN** Italian is active and the user enters `Chiama Ana stasera`
- **THEN** the task is due today with the evening flag set and the title `Chiama Ana`

#### Scenario: Someday view context
- **WHEN** the user adds `Read Proust` in the Someday view and `Read Proust tomorrow` in the same view
- **THEN** the first task is parked and the second is due tomorrow and not parked

### Requirement: Recurrence phrases
The parser SHALL recognise a recurrence phrase in the quick-add line and SHALL store it as the canonical English rule of the recurring-tasks grammar. Phrases SHALL cover every pattern of that grammar, including `after completion`, `until <date phrase>` and `for N times`, plus one-word forms (`daily`, `weekly`, `monthly`, `yearly`). After a monthly pattern (an ordinal weekday, a day of the month, `last day`, `last weekday`) the parser SHALL also swallow the bundled "of the month" phrase (`of the month`, `im Monat`, `du mois`, `del mese`, `del mes`, `do mês`), which changes nothing in the stored rule. An ordinal SHALL be an ordinal word or a number with an ordinal suffix; a bare number between the "every" word and a weekday SHALL be read as a count, which the grammar cannot express, so the whole phrase SHALL stay in the title and set neither a rule nor a date. The phrase SHALL be removed from the title; a phrase the grammar cannot express SHALL stay in it.

#### Scenario: Weekday rule
- **WHEN** the user enters `Water plants every Monday`
- **THEN** the task's title is `Water plants` and its rule is `every monday`

#### Scenario: Completion-relative rule with an interval
- **WHEN** the user enters `Change filter every 3 days after completion`
- **THEN** the rule is `every 3 days after completion`

#### Scenario: Ordinal weekday with an end date
- **WHEN** today is 2026-10-09 and the user enters `Board meeting every 2nd Tuesday until 31 Dec`
- **THEN** the rule is `every 2nd tuesday until 2026-12-31`

#### Scenario: Ordinal word and "of the month"
- **WHEN** today is Friday 2026-10-09 and the user enters `Board every second Monday` or `Board every 2nd monday of the month`
- **THEN** in both cases the title is `Board`, the rule is `every 2nd monday`, the task is due `2026-10-12`, and the recurrence chip reads `every 2nd monday · Mon 12 Oct`

#### Scenario: "Of the month" in each language
- **WHEN** today is 2026-10-09 and the user enters, with that language active, `jeden zweiten Montag im Monat`, `tous les 2e lundis du mois`, `ogni secondo lunedì del mese`, `cada segundo lunes del mes` or `toda segunda segunda-feira do mês` after a title
- **THEN** the rule is `every 2nd monday` in every case and nothing of the phrase remains in the title

#### Scenario: Last weekday of the month
- **WHEN** today is 2026-10-09 and the user enters `Close books every last friday of the month`
- **THEN** the rule is `every last friday`, the title is `Close books` and the task is due `2026-10-30`

#### Scenario: A count before a weekday is not an ordinal
- **WHEN** the user enters `Board every 2 Mondays`, `Treffen alle 2 Montage`, `Réunion tous les 2 lundis`, `Riunione ogni 2 lunedì`, `Reunión cada 2 lunes` or `Reunião cada 2 segundas-feiras`, with that language active
- **THEN** no rule is set, no due date is set, no chip is shown, and the title is the line as typed

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
A moment reminder (`remind me at 9`, `remind me tomorrow at 9`) SHALL be resolved after the view's defaults are applied. With a due date, the reminder SHALL be relative: its offset is the whole minutes from the due time (09:00 for a date-only due) to the moment, whose date defaults to the due date. Without one, the reminder SHALL be absolute at that moment in the device's zone, the date defaulting to today, or tomorrow when the moment has passed.

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

### Requirement: Token suggestions
In every field that parses (quick add, the task panel's title, the inline title editor), typing `#` at the start of a word SHALL open a list of projects, and typing `@` at the start of a word SHALL open a list of labels, under the field, filtered by the text typed after the symbol and matching any word of the name regardless of case, accents and spaces. Nested projects SHALL show their path. Arrow keys SHALL move through the list, Enter or Tab SHALL pick, Esc SHALL close the list and keep the text, and a pointer SHALL be able to pick. Picking SHALL replace the typed token with one that resolves to exactly that item and SHALL show its chip at once. When no item has exactly the typed name, the list SHALL end with an entry to create a project or a label with that name. A project created this way SHALL be a top-level personal project created through the op log, available offline and converging like any project creation. Inside double quotes no list SHALL open.

#### Scenario: Pick a project with spaces
- **WHEN** a project "Home renovation" exists and the user types `Paint the hall #ren` in quick add and presses Enter on the highlighted "Home renovation"
- **THEN** the line reads `Paint the hall #HomeRenovation `, a project chip reads "Home renovation", and adding the task puts it in that project

#### Scenario: Labels list
- **WHEN** labels "errand" and "deep-work" exist and the user types `@d`
- **THEN** a list shows "deep-work" highlighted and "Create label “d”" last

#### Scenario: Create a project offline
- **WHEN** the device is offline, no project "Garden" exists, and the user types `#Garden` and picks "Create project “Garden”"
- **THEN** a top-level project "Garden" exists at once, the chip reads "Garden", and both the project and the task sync when the device is back online

#### Scenario: Same names under different parents
- **WHEN** projects "Work › Docs" and "Home › Docs" exist and the user picks "Home › Docs"
- **THEN** the token inserted resolves to "Home › Docs" and the chip reads "Home › Docs"

#### Scenario: Esc keeps the text
- **WHEN** the project list is open after `#ho` and the user presses Esc
- **THEN** the list closes, `#ho` stays in the line, and quick add is not closed

### Requirement: Unmatched tokens are explained
When the caret leaves a `#token` that resolves to no project, the preview SHALL show a muted chip that says no project matches, or how many projects match when the token is ambiguous, and that the text stays in the title. Activating that chip SHALL open the project list for the token. An `@token` with no matching label SHALL show its chip as a new label.

#### Scenario: Unknown project
- **WHEN** no project starts with "gardn" and the user types `Rake leaves #gardn ` in quick add
- **THEN** a muted chip reads "No project “gardn” · stays in the title", and the task would be saved with the title `Rake leaves #gardn`

#### Scenario: Ambiguous prefix
- **WHEN** projects "Home" and "Homework" exist and the user types `Fix sink #hom `
- **THEN** a muted chip reads "2 projects match “hom”", and activating it opens the list with both

#### Scenario: New label
- **WHEN** no label "urgent" exists and the user types `@urgent `
- **THEN** the label chip reads "New label “urgent”"

### Requirement: Parsing while editing a title
The task panel's title field and the inline title editor SHALL parse the text the user types during the current edit with the same grammar, chips, dismissal and quoting as quick add. Text that was in the title when the edit began SHALL never be parsed. On commit, every recognised attribute SHALL be applied to the task (due, deadline, start, evening, priority, estimate, recurrence, reminders and project overwrite; labels are added to the task's labels) and its token SHALL be removed from the title, as one undoable change that applies locally at once and converges per field like any edit. Fields of tasks the user cannot edit SHALL not parse.

#### Scenario: Add a date and a priority while editing
- **WHEN** a task is titled "Call the bank" and the user appends ` tomorrow p1` in the panel title and presses Enter
- **THEN** the title is "Call the bank", the task is due tomorrow with priority 1, and the toast offers Undo for the whole change

#### Scenario: Old text is not re-read
- **WHEN** a task titled "Review may report" (saved with the date dismissed) is edited by appending ` draft`
- **THEN** no date chip appears, and the title becomes "Review may report draft" with no due date set

#### Scenario: Labels are added, not replaced
- **WHEN** a task has the label "errand" and the user types ` @deep-work` into its title and commits
- **THEN** the task has both labels, "errand" and "deep-work"

#### Scenario: Move with a project token
- **WHEN** a task in the Inbox is edited inline by typing ` #Work` and committed
- **THEN** the task moves to the project "Work" and the title no longer contains `#Work`

#### Scenario: Offline edit
- **WHEN** the device is offline and the user appends ` friday` to a title and commits
- **THEN** the due date and the new title apply at once and sync when online, converging with other devices' edits per field

#### Scenario: Viewer
- **WHEN** a viewer of a shared project focuses a task title
- **THEN** the title is not editable and nothing is parsed

### Requirement: Ordinal weekday phrases
The parser SHALL recognise an ordinal weekday as a one-off date: an optional article, an ordinal (`first`…`fourth`, `last`, or a number from 1 to 4 with an ordinal suffix such as `2nd`, `2.`, `2º`, `2e`), a weekday name, and optionally `of` with a month name (and optional year) or the bundled "of the month" phrase, each in every active language. The phrase SHALL be removed from the title and SHALL combine with a time like any date.

#### Scenario: Second Monday still ahead
- **WHEN** today is Friday 2026-10-09 and the user enters `Dentist second Monday` or `Dentist 2nd monday`
- **THEN** the task is titled `Dentist`, due `2026-10-12`, and the due chip reads that date

#### Scenario: Ordinal weekday with a time
- **WHEN** today is 2026-10-09 and the user enters `Board second Tuesday at 10:00`
- **THEN** the task is due `{date: "2026-10-13", time: "10:00"}` with the title `Board`

#### Scenario: Each language
- **WHEN** today is 2026-10-09 and the user enters, with that language active, `Treffen am zweiten Montag`, `Réunion le deuxième lundi`, `Riunione secondo lunedì`, `Reunión segundo lunes` or `Reunião segunda segunda-feira`
- **THEN** every task is due `2026-10-12` with the title `Treffen`, `Réunion`, `Riunione`, `Reunión` or `Reunião`

#### Scenario: Named month in each language
- **WHEN** today is 2026-10-09 and the user enters `Bericht dritten Freitag im November`, `Rapport le 3e vendredi de novembre`, `Rapporto terzo venerdì di novembre`, `Informe tercer viernes de noviembre` or `Relatório terceira sexta-feira de novembro`
- **THEN** every task is due `2026-11-20`

#### Scenario: Last weekday in each language
- **WHEN** today is 2026-10-09 and the user enters `Abschluss letzten Freitag`, `Clôture dernier vendredi`, `Chiusura ultimo venerdì`, `Cierre último viernes` or `Fecho última sexta`
- **THEN** every task is due `2026-10-30`

#### Scenario: Portuguese weekday alone is not an ordinal
- **WHEN** Portuguese is active, today is 2026-10-09 and the user enters `Reunião quarta`
- **THEN** the task is due Wednesday `2026-10-14`, because `quarta` counts as "fourth" only directly before a weekday name

#### Scenario: Ordinal without a weekday stays literal
- **WHEN** the user enters `Pay the second invoice`
- **THEN** no due date is set and the title is `Pay the second invoice`

### Requirement: Ordinal weekday resolution
Without a month, an ordinal weekday SHALL resolve to that weekday of the current month when it is today or later, else of the next month. With a month, it SHALL resolve to that month's occurrence in the current year when today or later, else in the next year. A fifth occurrence SHALL never be offered.

#### Scenario: First Monday already past rolls to next month
- **WHEN** today is Friday 2026-10-09 and the user enters `Pay rent first Monday`
- **THEN** the task is due `2026-11-02`

#### Scenario: Last Friday of the month
- **WHEN** today is 2026-10-09 and the user enters `Close books last Friday`
- **THEN** the task is titled `Close books` and due `2026-10-30`

#### Scenario: Named month with an article
- **WHEN** today is 2026-10-09 and the user enters `Report the 3rd Friday of November`
- **THEN** the task is titled `Report` and due `2026-11-20`

#### Scenario: Named month already past rolls to next year
- **WHEN** today is 2026-10-09 and the user enters `Audit first Friday of October`
- **THEN** the task is due `2027-10-01`

#### Scenario: One-off "of the month"
- **WHEN** today is 2026-10-09 and the user enters `Bins last Wednesday of the month`
- **THEN** the task is titled `Bins` and due `2026-10-28`

### Requirement: Ordinal weekday chips and storage
An ordinal weekday date SHALL get the ordinary due chip and SHALL be dismissable like any date, keeping its text in the title. Parsing SHALL stay a pure, offline function of the line, the reference date and the active languages; the task SHALL store the resolved date as its due value, so other devices never re-parse the line and converge on it like any due value.

#### Scenario: Dismissed ordinal weekday
- **WHEN** the user types `Review notes from last Friday` and dismisses the due chip
- **THEN** the title is `Review notes from last Friday`, the task has no due date, and the chip does not reappear while that text is unchanged

#### Scenario: Offline capture
- **WHEN** the device is offline and the user enters `Board second Tuesday #work`
- **THEN** the task is created locally with the resolved date and project, survives a reload, and uploads on the next successful sync
