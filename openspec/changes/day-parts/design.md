# Design

## Context

`task.evening` (kBool, `someday-and-evening`) drives This Evening: `groupToday` in `web/src/lib/dayLists.ts` splits today's group on it, `listGroups.ts` heads it "This Evening" with the implied `evening` suffix, `Shift+E` toggles it, quick add sets it from `tonight`/`this evening` (`eveningWords` in `web/src/lib/nlp/vocab/*.ts` and `internal/quickadd/vocab.json`), CalDAV maps it to `X-OPENTODO-EVENING:TRUE` (`internal/caldav/vtodo.go`, `decode.go`), the vault to `[evening:: true]` (`internal/vault/line.go`), the filter to the `evening` keyword, the importers write it, and the agent tools accept it (`internal/agenttools/write_planning.go`). Personal preferences are fields of the `user_prefs` "me" row.

## Goals / Non-Goals

**Goals:** Morning and Afternoon groups for tasks and habits, fully compatible with every reader and writer of `evening`; off by default.

**Non-Goals:** configurable boundaries or parts, time blocking (the calendar already does that), parts outside Today.

## Decisions

### D1: A new `day_part` field beside `evening`, not a widened `evening`

Alternatives:
- (a) Replace `evening` by an enum `day_part` with `evening` as a value and migrate. Rejected: renames a field's meaning (AGENTS rule 3), and every old client, CalDAV client and vault would lose This Evening until upgraded.
- (b) A `day_part` enum including `evening`, kept in sync with the bool. Rejected: two encodings of one fact that concurrent and old writers can make disagree.
- (c) **Chosen:** `day_part` ∈ {null, `morning`, `afternoon`}; Evening stays `evening: true`. The effective part is `evening` if the flag is set, else `day_part`, else (in Today, with day parts on) the part of the due time.

`day_part` is a new op kind `kDayPart` validated strictly on every write path (sync, REST, CalDAV, vault, MCP): an unknown value is rejected like an invalid `start`. Future parts would be a new additive value behind a schema note; clients read an unknown value as no part.

### D2: Coherent writes and convergence

Every client that sets a part writes both fields in the same batch: Morning = `{day_part: "morning", evening: false}`, Afternoon = `{day_part: "afternoon", evening: false}`, Evening = `{day_part: null, evening: true}`, Any time = `{day_part: null, evening: false}`. Writing both makes per-field LWW converge on the later choice as a whole: if device A sets Morning and device B sets Evening offline, whichever batch has the greater timestamps wins both fields. An old client writes only `evening`: turning it on over `day_part: morning` reads as Evening (the old client's intent); turning it off again leaves the task in Morning, the part it had before. CalDAV and vault writes follow the same pairing when they carry the new property; when they carry only the evening property they behave like an old client.

The part is kept when a task is rescheduled and when a recurring task advances or a habit is completed (the series keeps its fields, like `evening`), and copied to the completed occurrence record.

### D3: Grouping in Today

With `user_prefs.day_parts` = `on`, today's (non-Earlier, non-Blocked) tasks are grouped: **Today** (no part, untimed) first, then **Morning**, **Afternoon**, **This Evening**; empty groups are not shown, and when only one group has tasks no heading is shown beyond the existing rules. A timed task without a part goes to the part of its due time in the viewer's zone (`< 12:00`, `12:00–17:59`, `≥ 18:00`); an explicit part or the evening flag wins. Earlier stays one group (late tasks are not split), Blocked stays last, and the Waiting / Done today groups of `today-closed-list` come after. Within a group the order is Today's usual order. With day parts off, Today is exactly as today: Morning and Afternoon tasks are listed in the day group with a quiet part chip, and This Evening behaves as before (the time-derived evening placement applies only when day parts are on, so nothing moves for existing users).

Habits: a habit with a part is grouped like any task; this is the change's main use and needs no habit-specific code.

### D4: Setting a part, and progressive disclosure

The preference is in Settings → Preferences → Today ("Group Today by part of the day") and in Today's overflow menu in the modes `companion` and `first`. While it is off, the When popover keeps the single Evening toggle and no Morning/Afternoon control is offered anywhere; a part set from another device or integration shows as a chip. While it is on: the Do on segment shows a four-way segmented control; Today's part headings are drop targets (drag or keyboard move) that write the pairing of D2; the Actions menu gets a "Day part…" submenu (the `submenu` item kind of `action-menus`); palette commands without default keys. `Shift+E` is unchanged. No new shortcut.

### D5: Quick add phrases are gated by the preference

Bare `morning` and `afternoon` are common in titles ("Morning run"), so only `this morning`, `this afternoon` and a part word directly after a date phrase (`tomorrow morning`, `friday afternoon`, `fri evening`) are parsed, and only when day parts are on; `tonight` and `this evening` work in every mode as today. The parser gets a `dayParts` option (TypeScript and Go); `POST /api/v1/quick-add/parse` accepts `day_parts?: boolean` and the CLI reads the user's preference. Vocabulary per language (en, de, fr, it, es, pt) is added as `morningWords`/`afternoonWords` (the "this" forms) and `partWords` (the forms after a date), exported to `internal/quickadd/vocab.json` and `internal/importer/nlpvocab.json`, and pinned by `quickadd.vectors.json` cases run by both suites.

### D6: Integrations

- CalDAV: `X-OPENTODO-DAY-PART:MORNING|AFTERNOON`, omitted when null; `X-OPENTODO-EVENING` unchanged. A client sending the property sets both fields per D2 (Evening is still expressed only by `X-OPENTODO-EVENING`); an unknown value is kept in `ical_extra` and ignored.
- Vault: inline field `[daypart:: morning]`, written after `[evening:: true]` in the field order, never both written for one task; an unknown value is reported for the line.
- Filters: `morning` and `afternoon` match the stored field (not the time-derived placement); `evening` is unchanged.
- REST, MCP, CLI: `day_part` in the task representation; `create_tasks`/`update_tasks` accept it with the pairing applied server-side through `ApplyStrict`; `ot add/edit --part morning|afternoon|evening|none`.
- Activity: the field label "the part of the day", Go and TS with the shared fixture.

## Interface budget

No chrome row, no sidebar destination, no scroll region (groups inside Today's list). Task properties visible by default: the part replaces the evening chip outside Today (one chip slot, not two). No new shortcut.

## Data model, size

Additive: `task.day_part` (kDayPart, default null), `user_prefs.day_parts` (kString, default ""). Neither is content. No dependency; vocabulary strings add a few kB.

## Risks / Trade-offs

- [Two fields for one concept] → One read helper `dayPartOf(task)` in TS and Go; all writers use the pairing helper; tests assert no writer emits `evening: true` with a non-null `day_part`.
- [Time-derived placement surprises] → Applies only with day parts on and only in Today; an explicit part always wins; documented.
- [Parsing changes for users with the preference on] → Only "this …" and after-date forms; dismissable chip; vectors include "Morning run tomorrow" staying literal.

## Migration Plan

None: the field defaults to null and the preference to off. Rollback: turning day parts off restores today's Today; stored parts stay as chips.

## Open Questions

- Should the boundaries (12:00, 18:00) become preferences later? Deferred; fixed here.
