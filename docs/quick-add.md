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
| Turn parsing off on this device | Settings → Quick add → *Parse natural language in quick add*. Quick add then saves the line exactly as typed. |

A dismissed chip stays dismissed while you keep typing; it comes back only if you edit that word. Backspace only highlights a chip when that chip's text ends the line; otherwise Backspace deletes text as usual.

## Tokens (any language)

| Token | Meaning | Examples |
| --- | --- | --- |
| `#name` | Project, including sub-projects at any depth. Case-insensitive; spaces, `-` and `_` in project names are ignored. An exact name wins, otherwise a unique prefix. If several projects have exactly that name (say *Docs* under both *Work* and *Home*), the shallowest one in the tree wins (a fixed tie-break by id decides between equals, so every device picks the same one); the chip shows the path (`#Work › Docs`) so you can see which. Archived and deleted projects are skipped. If nothing matches, or a prefix fits more than one project, the token stays in the title. | `#work`, `#trav` (Travel), `#sideproject` (Side Project), `#q4` (Work › Docs › Q4 launch) |
| `@name` | Label, matched to an existing label ignoring case. A name with no label yet creates one when you press Enter, with the next free colour, exactly like creating it from the label picker; its chip says *new* until then. Use as many as you like. | `@call`, `@waiting-for` |
| `p1`–`p4` | Priority, 1 highest, 4 default. | `p1`, `P3` |
| `+duration` | Estimate in minutes, from 1 minute to 7 days (10080 minutes). Shown on the task row. | `+30`, `+30m`, `+45min`, `+2h`, `+1h30`, `+1.5h` |

Without the `+`, `45min` and `2h` also work, except that `2h` is left alone when French, Spanish or Portuguese is active, because those languages write times as `15h`.

## Dates and times

| Phrase | Resolves to |
| --- | --- |
| `today`, `tonight`, `tomorrow`, `day after tomorrow` | that day |
| `Monday` … `Sunday`, `mon`, `wed.` | the next one **after** today (on a Friday, `fri` means next Friday) |
| `this sat` | same as the bare weekday |
| `next Monday` | same as the bare weekday, unless that day is still in the current Monday–Sunday week; then the one a week later. On Friday 9 Oct, `next Wed` is 14 Oct and `next Sat` is 17 Oct (not tomorrow). |
| `in 3 days`, `in 2 weeks`, `in a month` | today plus that much (months keep the day, clamped to the month's end) |
| `next week`, `next month` | Monday of next week; the 1st of next month |
| `3 Feb`, `Feb 3`, `3rd of February`, `December 25th 2027` | that date; without a year, the next time it comes round (today counts) |
| `May`, `December` (full name alone) | the 1st of that month. Abbreviations (`mar`, `jan`) need a day number next to them. |
| `12/11`, `12-11`, `12/11/2027`, `2026-11-03` | numeric dates; see day/month order below |
| `at 3pm`, `3:30 pm`, `16:30`, `at 9`, `noon`, `midnight` | that time today, unless a date is also given. A time on its own always means today, even if it has passed. Without `am`/`pm`, hours are 24-hour (`at 3` is 03:00). |
| `in 3 hours` | that clock time, rolling to tomorrow past midnight |

Words like `on`, `by` and `due` in front of a date are removed with it (`Pay bill by Friday` → *Pay bill*). Bare numbers are never times (`Buy 3 apples` stays as typed): write `at 3`, `3pm` or `15:00`.

When a line has two dates, the first one counts and the second stays in the title. The same goes for a second time, project, priority or estimate.

**Day/month order.** `12/11` is 11 December when your first language is US English (`en`, `en-US`) and 12 November for every other language, including English outside the US. If one reading is impossible (`25/12`), the other is used. Dotted dates (`12.11.`) are always day.month and only used when the order is day/month. Change it under Settings → Quick add.

## Languages

Vocabulary is bundled for **English, German, French, Italian, Spanish and Portuguese**. The active languages are your browser's preferred languages that are bundled, plus English, which is always on; all of them are matched at the same time. Settings → Quick add can override the list on this device. Where two languages read a word differently, the longer phrase wins (Spanish `mar` alone is Tuesday; `mar 3` is March 3rd).

| | Examples |
| --- | --- |
| German | `heute`, `morgen`, `übermorgen`, `am Freitag`, `Mi.`, `nächsten Mittwoch um 15 Uhr`, `in 3 Tagen`, `nächste Woche`, `3. Februar`, `12.11.`, `14:30 Uhr` |
| French | `aujourd'hui`, `demain à 15h`, `après-demain`, `mardi prochain`, `dans 2 semaines`, `semaine prochaine`, `3 février`, `15h30`, `à 9 heures`, `midi` |
| Italian | `oggi`, `domani alle 15`, `dopodomani`, `lunedì prossimo`, `prossimo sabato`, `tra 3 giorni`, `fra una settimana`, `il 3 febbraio`, `mezzogiorno` |
| Spanish | `hoy`, `mañana a las 15:00`, `pasado mañana`, `el próximo lunes`, `martes que viene`, `en 3 días`, `dentro de 2 semanas`, `3 de febrero` |
| Portuguese | `hoje`, `amanhã às 15h`, `depois de amanhã`, `próxima segunda`, `sábado que vem`, `daqui a 3 dias`, `em 2 semanas`, `3 de fevereiro` |

Accents are optional (`manana`, `nachsten`, `fevrier` work too). Two-letter German abbreviations need their dot (`Mi.`, `Do.`) so ordinary words like *do* and *so* are not mistaken for weekdays.

## Views and defaults

Quick add still takes the view's context for anything the line does not set: today in Today, tomorrow in Upcoming, the current project in a project view, the current label in a label view. Anything the line does set wins, so `Plan trip next Monday #travel` typed in Today goes to *Travel* on Monday. Labels add up instead: `@call` typed in the *errand* label view gives the task both labels, so it stays in the view you added it from.

## Not (yet) understood

Recurrence ("every Monday"), reminders ("remind me at 9"), creating a project from an unknown `#name`, and parsing on the server, REST API or `ot` CLI. Those belong to later changes; see [ROADMAP.md](../ROADMAP.md).

## Data

Estimates are stored in the additive task field `estimate_minutes` (integer 1–10080 or null; see [api.md](api.md) and [sync.md](sync.md)). `@name` tokens are stored as label ids in the task's `labels` list, never as names; a new label is written as its own operation before the task, so both sync together and work offline.
