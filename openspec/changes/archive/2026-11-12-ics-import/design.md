## Context

The importer turns a file into normalised `Row`s through a `Profile`; the planner resolves projects, labels, parents and duplicates, and the job writes ops with device `import` (OpenSpec `data-import`). The CalDAV code already maps one calendar object resource (one `UID`, a `VTODO` master and its overrides) onto task fields with `caldav.Decode` (`internal/caldav/decode.go`), the mapping pinned by the CalDAV client fixtures. A Nextcloud Tasks export is one `VCALENDAR` holding many `VTODO`s, a few `VTIMEZONE`s and the list's name in `X-WR-CALNAME`.

## Goals / Non-Goals

**Goals:** import an `.ics` of tasks with the CalDAV mapping, so a task reads the same whether it arrives over CalDAV or from the file; subtasks in any order; one bad component never stops the rest.

**Non-Goals:** events, several lists per file, per-occurrence overrides, a new mapping of its own.

## Decisions

### D1: one profile, `caldav.Decode` per task

`icsProfile` (format `ics`) splits the unfolded file into its top-level components. Each `VTODO` is grouped with the others of the same `UID` (a master and its `RECURRENCE-ID` overrides), wrapped in a `VCALENDAR` with the file's `VTIMEZONE`s, and passed to `caldav.Decode`. The `Inbound` it returns becomes a `Row`. Alternatives: parsing the whole file with `caldav.Parse` and walking it — rejected, one unbalanced component would fail the whole file and `Decode` reads exactly one object; a second VTODO reader in the importer — rejected, two mappings drift.

The split is lenient: a component that is cut off (a `BEGIN:VTODO` without its `END`, or a calendar that ends inside it) and one `Decode` refuses (no `UID`, a bad `ESTIMATED-DURATION`, a line that does not parse) are one row in error with the reason. Components other than `VTODO` and `VTIMEZONE` are counted per kind in one file note.

### D2: dates as CalDAV reads them

The row takes the shape `Decode` reports (caldav-interop "Inbound date shapes"): `DUE` alone is the due date; `DTSTART` and `DUE` that differ are the due date (`DTSTART`) and the deadline (the date of `DUE`), as for a task synced over CalDAV; a `DTSTART` with a duration is a scheduled time. A `DTSTART` alone, which CalDAV keeps as client data, becomes the task's start date, since an imported task has no client data to keep it in. A zoned or UTC time becomes the wall time in the import's time zone, as every other importer does (`Due` in a row is floating). `X-OPENTODO-START`, `X-OPENTODO-EVENING` and `X-OPENTODO-ENERGY` (OpenTodo's own objects) are kept.

### D3: alarms

A mappable alarm (`caldav.Alarm.Mappable`) becomes a reminder of the row: an absolute trigger is an absolute reminder at that instant (a floating trigger read in the import's time zone); a relative trigger anchored on the task's due date (`RELATED=END` on a task whose `DUE` is its due date, `RELATED=START` when `DTSTART` is) is a relative reminder with that offset; one anchored on the other end (the deadline's `DUE`) becomes an absolute reminder at the anchor plus the offset. An alarm that cannot be mapped (an `EMAIL` or `AUDIO` action, a `REPEAT`, a location alarm) and alarms beyond `caldav.MaxMappedAlarms` are dropped with a warning. The planner's existing rules then apply (a past reminder is imported dismissed).

### D4: identity, parents and the project

The source id is `ics:<UID>`; the origin is `{kind: "import", provider: "ics", id: <UID>}`, which the duplicate detection keys on, so importing the same file again skips its tasks. `RELATED-TO` with `RELTYPE=PARENT` or without `RELTYPE` sets `ParentSourceID` to `ics:<parent UID>`; the planner already resolves parents in any order and makes a missing parent, a cycle or a parent in error a top-level task with a warning. `RELTYPE=DEPENDS-ON` sets the blockers the same way. `X-WR-CALNAME` names one project row (reused when a live project has that name); without it the tasks go to the target.

### D5: text and limits

`Decode` already unescapes text and splits `CATEGORIES`. The file is bounded by the upload limit and `MaxRows`; each task's object by `caldav.MaxBodyBytes` and its line limits, as on a CalDAV `PUT`.

## Data model impact

None: no new field, entity or op. Rows are written by the existing planner.

## Size and memory

No dependency. A few hundred lines of Go in the importer; the binary grows by a few KB. The file is held in memory once, as for every import, and each task's object is re-encoded and parsed on its own.

## Interface budget

The import screen gains one entry in its format menu and `.ics` in the file picker's `accept`; no new control, row of chrome, property, scroll region or shortcut.

## Offline and convergence

Unchanged: import runs on the server and needs a connection; the job writes ordinary operations, so offline devices receive the tasks on their next sync and converge under last-writer-wins.

## Risks / Trade-offs

- [`DTSTART` + `DUE` reads as due date and deadline, not start and due] → the same file synced over CalDAV reads the same way, which is the promise of the issue; the import docs say so.
- [Unmapped properties are lost] → listed in the docs; a CalDAV sync keeps them for people who need them.
