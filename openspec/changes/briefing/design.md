# Design

## Context

`precision-shell` D1 gave `PageHeader` a `briefing` slot on day pages, at the prose step in the muted tone. The facts the slot needs already exist:
- Today's membership (`lib/views` `inToday`, `overdueInToday`, `lib/dayLists`);
- blocked tasks (`lib/dependencies` `blockedMap`);
- estimates and the day length (`lib/calendar` `dayLoad`, the grid preferences' `dayLength`);
- the cached in-app notifications (`db.notifications`);
- the close of the day (`lib/review` `dayClosed`);
- the logical today and day start (`date-time-preferences`).

## Goals / Non-Goals

**Goals:**
- One sentence that says what stands out, computed on the device.
- Correct in all six languages without gluing words.
- Testable as a pure function with fixtures.

**Non-Goals:**
- Model-written text.
- A setting for the facts.
- The phone day head (see `precision-phone`).

## Decisions

### D1. Facts, then words

`lib/briefing.ts` `briefingFacts(input)` is pure. It returns data:
- the mode: `today`, `done`, `clear` or `upcoming`;
- the facts;
- counts;
- tomorrow's first task.

`app/Briefing.tsx` turns the data into words through the message layer.

This split pins the rules with fixtures (`briefing.fixtures.json`) independently of the language. It also leaves the wording free to change without touching the rules.

*Alternative:* produce strings in the rule function. Rejected: tests would depend on the catalog, and the tones need element boundaries.

### D2. The copy grammar

- **The lead** is one plural message: "One thing matters today." / "Two…" / "Three…", with exact forms `=2` and `=3` so each language spells the number.
- **Each fact is a whole clause message**, for example "`<task>{title}</task>` is {days, plural, …} late". A translation can reorder it freely.
- **Joining:** the clauses are joined with `formatList` (`Intl.ListFormat` in the reader's language; the Oxford comma in English). The join runs on placeholder marks, then each mark is replaced by the clause element, so each clause keeps its tone.
- **The first clause** is upper-cased on its first letter when it is plain text. That works in all six languages. Clauses are written lower-case: "today holds…", or a weekday name as `Intl` writes it mid-sentence.
- **Task titles and people's names** go in as values inside a `<task>` tag. They are never translated, and they are marked `user-text`.
- **Clauses avoid gendered adjectives about the task**, because titles have no grammatical gender. For example Portuguese uses "tem 2 dias de atraso", not "está atrasada", and Italian uses "è già al completo" for a weekday.

### D3. The rules

All of these run over live tasks, leaving out tasks of archived projects (`withoutArchived`, as the lists do):

- **Today, list not empty:** at most three facts, in this order.
  1. **Late:** the overdue tasks Today lists that are not blocked. One task is named with its days late (from the due date, or from a passed deadline when that is older). More than one is a count.
  2. **Load:** Today's whole list counted as today's work, late tasks included.
     - If its estimates exceed the day length, the fact is `overfull`.
     - Otherwise, the first of the next seven days whose estimates reach the day length is `full`, named by weekday.
  3. **Replies:** unread notifications of kind `mentioned` or `page_replied`.
     - One reply names who answered and about which task. The device's own copy names an encrypted task.
     - More than one is a count.
  - With no fact, the sentence is the calm fallback with the open count and the planned minutes.
- **Today, list empty:**
  - `done` when the day was closed, or a task (not a skipped habit occurrence) was completed on the logical today;
  - otherwise `clear`;
  - either way followed by tomorrow: the number of tasks Upcoming lists for tomorrow, and the first by due then priority, with its time.
- **Upcoming:**
  - the number of tasks Upcoming lists in the next seven days;
  - every one of those days that is full;
  - tomorrow.
- **Window:** seven days (`BRIEFING_DAYS`), the same as the week.

### D4. Replies

Notifications are server-side account data cached per device (`task-assignment`), so the sentence may differ between devices until each one refreshes. That is the same as the bell, and acceptable. Opening a task marks its notifications read, and the fact disappears.

### D5. Placement and tones

The briefing is the `briefing` prop of the day page's `PageHeader`: the prose step, muted, at most 72 characters per line.

| Part | Style |
| --- | --- |
| Lead | `font-semibold text-strong` |
| Late | `text-danger` |
| Load | `text-warning` |
| Replies | `text-strong` |
| Task titles | `text-strong` |

The colour only marks state (`precision-tokens`), and the words carry the meaning on their own.

The Daily check renders the same component as a paragraph above yesterday's line.

## Data model impact

None. No new field, entity or op. The sentence derives everything from rows already on the device.

## Interface budget

- **Rows of chrome:** none added above a list's first item. The briefing lives inside the day head that `precision-shell` already counts as the header. It is one paragraph of at most two lines on Today and Upcoming.
- **Task properties:** no new ones.
- **Sidebar destinations:** none added.
- **Scroll regions:** none added.
- **Shortcuts:** none added.

## Size and memory

No dependency. The rules and wording add roughly 3 KB to the main bundle before compression, plus about 2 KB per catalog.

The hook reuses the shared live-task snapshot. It reads the notification cache through the same live query as the bell (the 50 newest). Computing the briefing is linear in the number of tasks, and the window is fixed at seven days.

## Risks / Trade-offs

- **Translations of word order:** a language whose list pattern does not fit clause lists would read oddly. All six shipped ones use "a, b and c" patterns.
- **The day length is a per-device preference,** so "full" can differ between devices with different day lengths. The calendar already behaves this way.
- **The sentence can feel repetitive day after day.** That is accepted: it is a briefing, not a greeting, and it changes as the facts change.
