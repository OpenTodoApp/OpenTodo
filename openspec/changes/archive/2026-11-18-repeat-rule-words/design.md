# Design

## Context

- A rule is stored as canonical English (`web/src/lib/recurrence.ts` `parseRule`, `canonicalOf`; Go `internal/recurrence`). The web app prints the stored string in four places: the Repeat segment (`WhenControl.tsx`, "Repeats {rule}"), the facts line (`facets.ts`), the quick-add chip (`ParseChips.tsx` `chipText`) and the assistant's change lines (`assistant.ts`).
- The Repeat presets already have translated labels: "Every day", "Every weekday", "Every week on {weekday}", "Every month on day {day}".
- The message layer has plurals and `select`, and the catalogue check requires a translation to use the same arguments as its source (`scripts/i18n-check.mjs`).

## Decisions

**D1. Words from the parsed rule, one function.** `ruleWords(rule: string): string` parses the stored rule and returns its words; a rule that does not parse is returned unchanged (a rule written by a newer version stays readable). Every place that shows a rule calls it. Nothing is stored: the words are derived on the device, offline, and change with the interface language.

**D2. Whole messages, in the presets' wording.** One message per kind of rule, reusing the presets' messages where they exist. Weekday and month names come from the date locale (`weekdayName`, `monthName`); several weekdays are joined with `formatList`. Counts use plural messages ("Every {n, plural, …}"); an interval of one has its own message ("Every week"), because in languages whose `one` category covers 21 the plural message must still carry the number.

**D3. The ordinal can agree with the weekday.** In Italian, Portuguese, Polish and Russian "first" depends on the weekday's gender. So in "Every month on the {ordinal} {weekday}" the weekday is a `select` argument (`mon` … `sun`), not a name put into the sentence: a translation can choose the ordinal by weekday. English names the seven days in the message. The yearly form adds the month by name; languages where that would need another case put it in brackets.

**D4. Ends wrap the pattern.** "after completion", "until {date}" and "for N times" are three messages with a `{rule}` argument around the pattern's words, so a language can put them before or after ("完成后每 3 天"). The end date is formatted with the user's date format.

**D4a. Two starts.** The messages are sentences ("Every week on Thursday"), as the presets are. The facts line and the quick-add chip write their facts small ("evening", "deadline Fri 23 Oct"), so there `ruleWords(rule, true)` lowers the first letter with the interface locale; nothing else of the sentence changes, so German nouns keep their capitals.

**D5. The Repeat field keeps the stored rule.** While it only accepts English, showing translated text in it would offer text it then refuses. The translated words are the line above the presets. The second half of #1427 changes both together.

Alternatives: printing from the quick-add vocabulary (`web/src/lib/nlp/vocab`), so what is shown is what can be typed. Rejected: the vocabulary lists accepted spellings, not one preferred sentence, has no gender or plural forms, and does not exist for Russian and Chinese. Translating the stored string word by word: rejected, word order and agreement differ.

## Data model

None. No field, op, route or setting.

## Interface budget

No new row, property, destination, scroll region or shortcut: an existing line of text changes its words (`docs/interface-guide.md`).

## Size

`recurrenceWords.ts` is about 60 lines and reaches the first load through `facets.ts`; `recurrence.ts`, `dates.ts` and the message layer are already there. The first-load gzip budget is unchanged (`make bundle-budget`).
