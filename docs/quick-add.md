---
title: Quick add syntax
summary: Every word quick add understands: dates, times, projects, labels, priorities, estimates, six languages and voice capture.
audience: user
section: Reference
specs: [natural-language-capture, voice-capture]
screens: [settings/quick-add, settings/voice]
order: 10
---
# Quick add syntax

Type one line in the quick-add box (press `q` in any task view) and OpenTodo picks out the due date and time, project, labels, priority and estimate:

```
Meeting with Sarah next Wed at 3pm #work @call p1 +30m
```

creates **Meeting with Sarah**, due next Wednesday at 15:00, in project *Work*, with the label *call*, priority 1, estimated at 30 minutes.

Everything runs in your browser. The parser needs no network, sends nothing anywhere, and gives the same result on every device for the same line, date, languages and projects. The created task stores the resolved date, so other devices never parse the line again.

## Preview chips

As you type, each thing OpenTodo recognises shows up as a chip under the input, and the title preview (`→ Meeting with Sarah`) shows what will be saved. Nothing is hidden: if there is no chip, the text stays in the title.

| To… | Do this |
| --- | --- |
| Keep a word literally ("may" is not May 1st) | Click the `×` on its chip, **or** press Backspace at the end of the line: the first press highlights the last chip, the second dismisses it. The text itself is not changed. |
| Never parse some text | Put it in double quotes: `Watch "Next Friday" tomorrow` → title *Watch Next Friday*, due tomorrow. The quotes are removed from the title. |
| Turn parsing off on this device | Settings → Capture → Quick add → *Parse natural language in quick add*. Quick add then saves the line exactly as typed. |

A dismissed chip stays dismissed while you keep typing; it comes back only if you edit that word. Backspace only highlights a chip when that chip's text ends the line; otherwise Backspace deletes text as usual.

## Tokens (any language)

| Token | Meaning | Examples |
| --- | --- | --- |
| `#name` | Project, including sub-projects. Case-insensitive; spaces, `-` and `_` are ignored. An exact name wins, otherwise a unique prefix; `#Home/Docs` picks *Docs* under *Home*. If nothing matches, or a prefix fits several projects, the token stays in the title and a grey chip says so. | `#work`, `#trav` (Travel), `#sideproject` (Side Project), `#Home/Docs` |
| `@name` | Label, matched ignoring case. A name with no label yet creates one when you press Enter; its chip says *New label* until then. Use as many as you like. | `@call`, `@waiting-for` |
| `p1`–`p4` | Priority, 1 highest, 4 default. | `p1`, `P3` |
| `+duration` | Estimate in minutes, from 1 minute to 7 days (10080 minutes). Shown on the task row. | `+30`, `+30m`, `+45min`, `+2h`, `+1h30`, `+1.5h` |
| `spent/estimate` | Time already spent and an estimate (see [Time spent](#time-spent)). | `30m/2h`, `1h/1h30`, `45min/2h` |

The same works when you edit a title in the task panel: type ` tomorrow p1` after the title and press <kbd>Enter</kbd>, and the date and priority are set with the title left as it was; only what you typed in this edit is read, and **Undo** takes it back.

Type `#` or `@` and a list of your projects or labels opens under the field, narrowed as you type; arrows move, <kbd>Enter</kbd> or <kbd>Tab</kbd> picks, <kbd>Esc</kbd> closes it. When nothing has that name, the last entry creates it.

Without the `+`, `45min` and `2h` also work, except that `2h` is left alone when French, Spanish or Portuguese is active, because those languages write times as `15h`.

### Time spent

`Draft the offer 30m/2h` creates the task with a two-hour estimate and one closed [time entry](time-tracking.md) of 30 minutes ending now, in the same step; the preview shows a **Spent 30 min** chip beside the estimate, and the row reads `30m / 2h`. Both parts need a unit (`h`, `m`, `min`), so `Pay rent 30/12` stays a date, and `Réunion 15h` with French active is still a meeting at 15:00. `+30m` remains an estimate only. Units are not translated: the token works the same in all six languages. Backspace on the chip keeps the text in the title, like every token.

## Dates and times

| Phrase | Resolves to |
| --- | --- |
| `today`, `tonight`, `tomorrow`, `day after tomorrow` | that day |
| `Monday` … `Sunday`, `mon`, `wed.` | the next one **after** today (on a Friday, `fri` means next Friday) |
| `this sat` | same as the bare weekday |
| `next Monday` | same as the bare weekday, unless that day is still in the current week; then the one a week later. Weeks start on your first day of the week (Monday unless you change it). On Friday 9 Oct, `next Wed` is 14 Oct and `next Sat` is 17 Oct (not tomorrow). |
| `second Monday`, `2nd monday`, `last Friday`, `Bins last Wednesday of the month` | that weekday of this month, or of next month once it has passed (`first` … `fourth` and `last`; on Friday 9 Oct, `second Monday` is 12 Oct and `first Monday` is 2 Nov). There is no fifth: `5th Friday` stays as typed. |
| `the 3rd Friday of November`, `first Friday of October 2028` | that weekday of that month, this year or next (today counts); with a year, that year |
| `in 3 days`, `in 2 weeks`, `in a month` | today plus that much (months keep the day, clamped to the month's end) |
| `next week`, `next month` | the first day of next week (Monday unless you start your week on Sunday or Saturday); the 1st of next month |
| `3 Feb`, `Feb 3`, `3rd of February`, `December 25th 2027` | that date; without a year, the next time it comes round (today counts) |
| `May`, `December` (full name alone) | the 1st of that month. Abbreviations (`mar`, `jan`) need a day number next to them. |
| `12/11`, `12-11`, `12/11/2027`, `2026-11-03` | numeric dates; see day/month order below |
| `at 3pm`, `3:30 pm`, `16:30`, `at 9`, `noon`, `midnight` | that time today, unless a date is also given. A time on its own always means today, even if it has passed. Without `am`/`pm`, hours are 24-hour (`at 3` is 03:00). |
| `in 3 hours` | that clock time, rolling to tomorrow past midnight |

Words like `on`, `by` and `due` in front of a date are removed with it (`Pay bill by Friday` → *Pay bill*). `last Friday` always means the last Friday of the month, never the one that has passed: in `Review notes from last Friday`, dismiss the chip (or quote the words) to keep them in the title. Bare numbers are never times (`Buy 3 apples` stays as typed): write `at 3`, `3pm` or `15:00`.

**Deadlines.** Put `deadline` right before a date to set the task's [deadline](tasks-and-projects.md#deadlines) instead of its due date: `Send report deadline friday` → *Send report*, no due date, deadline Friday, shown as its own chip with an hourglass. Combine both: `Send report tomorrow deadline friday` is planned for tomorrow and due by Friday. A deadline has no time, so a time right after it stays in the title. Without a date after it the word is just text (`Review deadline policy`). `on`, `by` and `due` still set the due date. Each language has its own word:

| Language | Deadline word |
| --- | --- |
| English | `deadline` |
| German | `Frist`, `Deadline` |
| French | `échéance`, `deadline` |
| Italian | `scadenza` |
| Spanish | `fecha límite`, `plazo` |
| Portuguese | `prazo` |

**Someday and tonight.** `someday` parks the task in [Someday](tasks-and-projects.md#when-a-task-starts): `Learn to sail someday @hobby` → *Learn to sail*, parked. If the line also has a date, the word stays in the title (`Plan someday trip friday` is due Friday). `tonight` and `this evening` make the task due today and mark it for **This Evening**, a group below the day's tasks in Today; a time still sets the due time (`Call Ana tonight at 8pm`). Before this, `tonight` only meant today; the date is the same, the task now also shows the moon. Each gets its own chip.

| Language | Someday | Tonight |
| --- | --- | --- |
| English | `someday`, `some day` | `tonight`, `this evening` |
| German | `irgendwann` | `heute Abend` |
| French | `un jour` | `ce soir` |
| Italian | `prima o poi` | `stasera` |
| Spanish | `algún día` | `esta noche` |
| Portuguese | `algum dia` | `hoje à noite` |

When a line has two dates, the first one counts and the second stays in the title. The same goes for a second time, deadline, project, priority or estimate.

**Day/month order.** While **Numeric dates like 12/11** is on **Automatic**, the order follows your date format in **Settings → General → Date and time**: day-month reads `12/11` as 12 November, month-day as 11 December. With the date format on System or ISO, it follows your language instead: 11 December when your first language is US English (`en`, `en-US`) and 12 November for every other language, including English outside the US. The Automatic option says which one decided. Choosing day/month or month/day under **Settings → Capture → Quick add** fixes the order on this device and wins over your date format. If one reading is impossible (`25/12`), the other is used. Dotted dates (`12.11.`) are always day.month and only used when the order is day/month.

**Week start.** `next week` and `next <weekday>` use **Week starts on** in **Settings → General → Date and time**, so they give the same result on all your devices.

## Languages

Vocabulary is bundled for **English, German, French, Italian, Spanish and Portuguese**. The active languages are the [interface language](language.md) when you picked one, then your browser's preferred languages that are bundled, plus English, which is always on; all of them are matched at the same time. With the interface language on **System** the order is your browser's, as before. Settings → Capture → Quick add can override the list on this device. Where two languages read a word differently, the longer phrase wins (Spanish `mar` alone is Tuesday; `mar 3` is March 3rd).

| | Examples |
| --- | --- |
| German | `heute`, `morgen`, `übermorgen`, `am Freitag`, `Mi.`, `nächsten Mittwoch um 15 Uhr`, `in 3 Tagen`, `nächste Woche`, `3. Februar`, `12.11.`, `14:30 Uhr` |
| French | `aujourd'hui`, `demain à 15h`, `après-demain`, `mardi prochain`, `dans 2 semaines`, `semaine prochaine`, `3 février`, `15h30`, `à 9 heures`, `midi` |
| Italian | `oggi`, `domani alle 15`, `dopodomani`, `lunedì prossimo`, `prossimo sabato`, `tra 3 giorni`, `fra una settimana`, `il 3 febbraio`, `mezzogiorno` |
| Spanish | `hoy`, `mañana a las 15:00`, `pasado mañana`, `el próximo lunes`, `martes que viene`, `en 3 días`, `dentro de 2 semanas`, `3 de febrero` |
| Portuguese | `hoje`, `amanhã às 15h`, `depois de amanhã`, `próxima segunda`, `sábado que vem`, `daqui a 3 dias`, `em 2 semanas`, `3 de fevereiro` |

Ordinal weekdays work in every language, with the ordinal words or a number with its suffix (`2nd`, `2.`, `2º`, `2e`): `am zweiten Montag`, `dritten Freitag im November`, `le 2e lundi de novembre`, `secondo lunedì`, `tercer viernes de noviembre`, `segunda segunda-feira`, `última sexta`. In Portuguese, `segunda` and `quarta` count as *second* and *fourth* only right before a weekday; alone they are Monday and Wednesday.

Accents are optional (`manana`, `nachsten`, `fevrier` work too). Two-letter German abbreviations need their dot (`Mi.`, `Do.`) so ordinary words like *do* and *so* are not mistaken for weekdays.

## Views and defaults

Quick add still takes the view's context for anything the line does not set: today in Today, tomorrow in Upcoming, the current project in a project view, the current label in a label view. Anything the line does set wins, so `Plan trip next Monday #travel` typed in Today goes to *Travel* on Monday. Labels add up instead: `@call` typed in the *errand* label view gives the task both labels, so it stays in the view you added it from. A task added in **Someday** is parked, unless the line sets a date (`Read Proust tomorrow` is due tomorrow instead).

## Voice

Quick add can also be dictated. Voice capture is **off by default** and is switched on per device in **Settings → Capture → Voice capture**; it is not synced, so turning it on for your phone leaves your laptop as it is. Browsers without speech recognition (Firefox, for example) show the switch disabled with an explanation, and quick add has no microphone button there.

With voice capture on, press the microphone button in quick add or `Shift+V` anywhere outside a text field (plain `v` already toggles list and board in a project). Words appear in the box as they are recognised; when you stop talking, press the button again or press `Esc`, the final transcript is inserted at the caret and parsed exactly like typed text, chips included. **Nothing is saved until you press Enter**, so you can correct the line by hand first.

Spoken forms of the tokens are turned into their typed forms first, in the active quick-add languages (English is always on):

| Said | Becomes |
| --- | --- |
| "renew insurance hashtag home priority two" | `renew insurance #home p2` |
| "standup at nine thirty am" | `standup at 9:30am` |
| "call the dentist tomorrow at nine" | `call the dentist tomorrow at 9` |
| "label errands buy stamps" | `@errands buy stamps` |
| "phone mum at call" (an existing label *call*) | `phone mum @call` |
| "plan move project home office" (an existing project) | `plan move #homeoffice` |
| "write report for thirty minutes", "one hour and fifteen minutes" | `write report +30m`, `+75m` |
| "ping Ana in two hours" | `ping Ana in 2 hours` |
| "um neun Uhr dreißig", "alle nove", "a las diez", "à neuf heures", "às onze" | `um 9:30`, `alle 9`, `a las 10`, `à 9 heures`, `às 11` |

Trigger words per language: *hashtag* (all), *project / Projekt / projet / progetto / proyecto / projeto* (only before an existing project's name), *label / Etikett / étiquette / etichetta / etiqueta*, and *priority / Priorität / priorité / priorità / prioridad / prioridade* followed by one to four. Numbers are only converted next to a time, priority or duration cue, so "buy two apples" stays as it is.

The recognition language follows your first quick-add language, so the interface language when you picked one (with your browser's region, for example `en-GB`), and can be changed in Settings. If the browser cannot recognise that language, OpenTodo says so once and listens in the browser's default language.

If the microphone is blocked, a message explains how to allow it in the browser's site settings and the button stays there to retry. When nothing is said, listening just stops. When recognition is unavailable (for example offline, in a browser that needs its vendor's service), quick add says "Voice capture is unavailable right now" and typing works as usual. Text already in the box is never cleared.

### Privacy

Before voice capture can be switched on, Settings shows this statement and waits for you to confirm:

- Speech is recognised by your browser, not by OpenTodo.
- Depending on the browser, your audio may be sent to the browser vendor's speech service (for example Google for Chrome, Apple for Safari) and handled under their privacy policy.
- OpenTodo asks the browser to recognise speech on this device when it offers that choice.
- Your OpenTodo server never receives audio or transcripts. Only the task you save with Enter is stored and synced, like a typed one.
- The microphone is used only while you dictate; the browser asks for permission the first time.

OpenTodo's code never records, stores or sends audio: the Web Speech API hands it text. On-device recognition is requested whenever the browser reports it available for the language (Chromium's `processLocally`); OpenTodo never asks the browser to download a speech model. The browser asks for microphone permission on your first dictation, not when you switch the setting on.

## Repeat and remind

A rule and reminders can be typed in the same line. Each gets its own chip and is removed from the title.

| English | Deutsch | Français | Italiano | Español | Português |
| --- | --- | --- | --- | --- | --- |
| `every Monday` | `jeden Montag` | `tous les lundis` | `ogni lunedì` | `cada lunes` | `toda segunda-feira` |
| `every 3 days after completion` | `alle 3 Tage nach Erledigung` | `tous les 3 jours après achèvement` | `ogni 3 giorni dopo il completamento` | `cada 3 días después de completar` | `todo 3 dias após a conclusão` |
| `daily`, `weekly`, `monthly`, `yearly` | `täglich`, `wöchentlich`, `monatlich`, `jährlich` | `quotidiennement`, `hebdomadairement`, `mensuellement`, `annuellement` | `quotidianamente`, `settimanalmente`, `mensilmente`, `annualmente` | `diariamente`, `semanalmente`, `mensualmente`, `anualmente` | `diariamente`, `semanalmente`, `mensalmente`, `anualmente` |
| `remind me 30 min before` | `erinnere mich 30 Minuten vorher` | `rappelle-moi 30 min avant` | `ricordamelo 30 minuti prima` | `recuérdame 30 minutos antes` | `lembre-me 30 minutos antes` |
| `remind me at 9` | `erinnere mich um 9 Uhr` | `rappelle-moi à 9h` | `ricordamelo alle 9` | `recuérdame a las 9` | `lembre-me às 9` |

Rules cover the whole [rule grammar](recurrence.md): weekday lists (`every mon, wed and fri`), `every weekday`, `every 15th`, `every 2nd Tuesday`, `every last Friday`, `every last day`, with `after completion`, `until 31 Dec` or `for 10 times` at the end. The stored rule is always the English canonical form, whatever language you typed. A phrase the grammar cannot express, such as `every 3 hours`, stays in the title; only the first rule of a line counts. After a monthly rule, `of the month` is accepted and changes nothing (`every 2nd monday of the month`, `jeden zweiten Montag im Monat`, `tous les 2e lundis du mois`, `ogni secondo lunedì del mese`, `cada segundo lunes del mes`, `toda segunda segunda-feira do mês` are all `every 2nd monday`). A bare number before a weekday is a count, not an ordinal: `every 2 Mondays` (`alle 2 Montage`, `cada 2 lunes`) is not a rule and stays as typed, with no date.

**First date.** Without a date in the line, the task is due on the rule's first occurrence from today, and the rule chip shows it (`every monday · Mon 12 Oct`). With a date (`Invoice every month 3 Nov at 10:00`) that date starts the series; a time becomes the series' time. The view's own default date never replaces the rule's date.

**Reminders.** `remind me` followed by an offset (`30 min before`, `1 hour after`, `2 days before`) or a moment (`at 9`, `tomorrow at 9`, `20 Oct at 9`). Several reminders per line are fine. A moment on a task with a due date becomes a reminder relative to it, counting a date-only due as 09:00 (`Pay rent 3 Nov remind me at 8` reminds an hour before), so it moves with the task and repeats with the series. On a task without a due date a moment is a one-off reminder at that time (tomorrow if the time has passed today), and an offset waits until the task gets a due date (its chip says *needs a due date*). `remind me` alone, or in quotes, stays in the title. The task, its rule and its reminders are saved together, offline too.

## Not understood

An unknown `#name` stays in the title unless you pick **Create project** from the list. The server and the REST API do not parse lines; the [`ot` CLI](cli.md) does with `ot add --natural`. Some ideas are listed under [future ideas](../ROADMAP.md#future-ideas).

## Data

Estimates are stored in the additive task field `estimate_minutes` (integer 1–10080 or null; see [api.md](api.md) and [sync.md](sync.md)). `@name` tokens are stored as label ids in the task's `labels` list, never as names; a new label is written as its own operation before the task, so both sync together and work offline.
