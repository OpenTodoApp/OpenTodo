# Design

## Context

Observed today (`web/src/app/task-detail/WhenControl.tsx`, `DoOn`, lines 150-182), top to bottom:

1. Quick choices: Today, Tomorrow, This weekend, Next week and No date, each with its date.
2. The date field, with the placeholder "Not scheduled" (Do on passes `emptyText`). The generic "Type a date: fri, 3 days, …" is never seen here.
3. The preview line.
4. The month calendar.
5. A ghost "Add time" button. It only flips local state and then shows the `TimeField` with 09:00, 13:00 and 18:00 and "Remove time".
6. Day parts off: the `EveningSwitch`, a "This Evening" switch described as "Listed in the evening group of Today". Day parts on: a "Part of the day" radiogroup.
7. When a time is set, the `ZoneControl` line: "Floating time · Change".

Data rules that bind this change:

- The pairing in `day-parts` "Day part field" (`web/src/lib/dayParts.ts:25-27`, `internal/daypart`):
  - Morning: `morning`/false
  - Afternoon: `afternoon`/false
  - Evening: null/true
  - Any time: null/false
- Placement: `placedPart` uses the stored part, else the due time (before 12:00 Morning, until 17:59 Afternoon, then Evening).
- `start-dates` says the evening flag is independent of the due time.
- A 1.0 client (tag `v1.0.0` has `day_part`) reads Evening from `evening`, a known `day_part`, and anything else as none.

## Goals / Non-Goals

**Goals:**
- One control for "when on that day".
- A field that teaches itself through its placeholder.
- The zone explained by where it sits.
- The segment about a third shorter, with the calendar unchanged.

**Non-Goals:**
- New stored meanings.
- Deriving a part from a time on write.
- Changing the other segments or the facts column.

## Decisions

**D1. One "when on that day" row.** The row is a segmented control: **Any time | Morning | Afternoon | Evening | Time**, or **Any time | Evening | Time** with day parts off. Its accessible name is "Time of day", and it has no visible heading.
- Selection reads from the task: Time when `due.time` is set, else the stored part, else Any time. A task that holds both (written by `Shift+E`, an older client or REST) selects its part and still shows the time line, so nothing stored is hidden.
- The row is only enabled when the task has a do date. Without one it is shown disabled, its name saying a date comes first, so the segment does not jump when a date is picked.
- Alternatives considered:
  - Keeping a switch for Evening and a separate time button, as today. Rejected: two controls for one question, and the switch's "This" is wrong on any other day.
  - A dropdown. Rejected: it hides the five choices behind a click in an editor whose purpose is speed.

```
 Do on   Start   Deadline   Repeat   Reminders
 ┌──────────────────────────────────────────┐
 │ tomorrow 3pm, next fri                   │
 └──────────────────────────────────────────┘
 → Tue 10 Nov, 15:00
 Today · Tomorrow · This weekend · Next week
 ┌ November 2026 ──────────────── ‹ › ┐
 │  (calendar, unchanged)             │
 └────────────────────────────────────┘
 [ Any time | Morning | Afternoon | Evening | Time ]
   15:00 ▾                          Floating ▾
                              Clear      Close
```

**D2. A part and a time are exclusive in this control (recommended rule).** A single choice writes one batch with Undo:
- Choosing **Time** with a value writes `due.time`, plus `day_part: null` and `evening: false`.
- Choosing a part writes that part's pairing, plus `due` without `time` (and without `tz`, which only applies to a time).
- Choosing **Any time** writes null/false and removes the time.

The rule lives in this control only. `Shift+E`, the "Day part…" submenu, dragging onto a Today heading, quick add, REST, CalDAV, the agent tools and 1.0 clients keep their current writes. So no writer anywhere changes meaning, and the `day-parts` reader rule (a stored part wins over the time) still settles a task that holds both.

Alternatives considered:
- **Derive the part from the time on write** (19:30 writes Evening). Rejected for three reasons:
  - It would store a second copy of a fact the time already gives. Placement already derives it on read.
  - A later time edit from CalDAV or a 1.0 client would leave a stale part that wins over the new time.
  - The part boundaries are fixed today and would become stored data.
- **Keep both independent**, as the specs allow today. Rejected: that is the confusion the owner reported. "Evening" plus "09:00" has no meaning a person can act on.

**D3. The time line holds the zone.** Under the row, only while Time is selected, one line holds:
- the time field (typed or chosen from the three suggestions in its menu);
- at the line's end, the zone behaviour as quiet text with a chevron: "Floating", or the city, as in "Berlin". It opens the existing zone popover with its explanation, "Make floating", "Fix to my zone" and "another zone".

"Remove time" goes, because Any time or a part removes it. The `z` key keeps working. This is `ZoneControl` with a new `inline` variant. It is not button-styled, so the `web-app` rule against a button-styled zone holds. Alternative considered: keeping the zone on its own line below. Rejected: that is the stray placement the owner reported.

**D4. The field teaches itself.**
- The placeholder is a localized example: "tomorrow 3pm, next fri". German and the other catalogues get their own examples that the reader accepts; a catalogue test parses every locale's example.
- The field reads typed text with the quick-add date reader (`web/src/lib/nlp`, already in the first load) when the date reader alone does not understand it. A time it finds goes into the same batch as the date and follows D2.
- The preview reads "→ Tue 10 Nov, 15:00" before Enter.
- Alternative considered: helper text under the field. Rejected by the bar: the example in the field is the help.

**D5. Compact quick choices.**
- One row of four text choices (Today, Tomorrow, This weekend, Next week). Each date is in its accessible name and tooltip instead of a second word, and the chosen choice is on the selected surface.
- "No date" goes, because Clear in the footer removes the date.
- The preview line takes no height while empty.
- With the time line closed, the segment drops from about 470 px to about 400 px at the 360 px phone sheet.

## Data model

None. `due {date, time?, tz?}`, `evening` and `day_part` keep their kinds, defaults and meanings. No op schema change, no migration. The writes in D2 are combinations every client already writes: "Remove time" plus "Any time", or "Add time" plus "Any time".

## Interface budget

- The popover is not list chrome: rows above a list's first item are unchanged.
- The facet line still shows at most the same parts.
- No new scroll region: the popover keeps one, and on a phone the sheet keeps one.
- No new shortcut: `Shift+E` and `z` are unchanged.

## Size

No dependency. A few hundred bytes gzip in the task detail chunk. The first-load budget is not raised.

## Risks / Trade-offs

- [A reminder relative to the due time loses its anchor when a part replaces the time] → the batch is one Undo. The Reminders segment already handles a due without a time as it does after "Remove time" today.
- [People who used Evening plus a time as "evening, roughly at 19:00"] → the time alone places the task in This Evening on Today, so the grouping they wanted is kept.
- [A typed time in a language whose reader does not know the word] → the date reader runs first, unchanged, and the error message stays.

## Migration Plan

UI only. It ships behind nothing, and rollback is a revert. Stored tasks with both a part and a time keep showing both until someone edits them.

## Open questions for the owner

1. **Should `Shift+E` follow the same exclusive rule** (clear a time when it sets Evening)? Recommendation: no. Keep `Shift+E` as it is, a quick toggle that never removes data silently. The exclusive rule stays a property of the one control where both answers are visible side by side.
2. **Should a task with a time but no part show its derived part in the row**, for example Evening shown faintly for 19:30? Recommendation: no. Select Time only. Placement already shows the derived part on Today, and a second, faint selection would make the control read as two answers again.
