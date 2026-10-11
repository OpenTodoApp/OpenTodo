# Design

## Context

`internal/importer` reads a file with a profile into normalised `Row`s. The planner (`plan.go`) resolves the rows against the user's data and produces entity changes, and the service writes those changes as ops (`sync.Apply`, device `import`) in batches of at most 1,000. `import_items` records what each job created, which serves both re-import detection and undo.

The own-export profile (`opentodo`) copies each entity verbatim: original id and every field in `sync.Schema`. Today it reads only `labels`, `projects` and `tasks`. The foreign profiles fill `Row` fields. Until now, recurrence and reminders only produced warnings, and `SectionName` became a label or was dropped.

Since the importer was written, the data model gained:
- `section`: name, project_id, position.
- `reminder`: task_id, kind, offset_minutes, fire_at, delivered_at, dismissed_at.
- `view`.
- `comment`, which has authorship rules and a per-account creation rate limit.
- Task fields: `recurrence`, `series_id`, `section_id`, `notes_doc`, `due.tz`, `ical_extra`, `estimate_minutes`, `assignee_id`.

The export carries all of these.

## Goals / Non-Goals

**Goals:**
- An own export imported into a fresh account gives back the same projects, labels, tasks, sections, reminders and views.
- Foreign recurrence, reminders and sections are mapped where the model can express them. Where it cannot, the row says so in the preview.
- The preview stays accurate: it counts new sections, recurring tasks and reminders.
- Nothing is written outside the op log, and undo still removes everything a job created.

**Non-Goals:**
- Importing comments (D3).
- New op fields, new entities or new migrations.
- Changing how imports reach webhooks (the post-commit observer is unchanged).

## Decisions

### D1. Own export: keep ids, do not remap
Sections, reminders and views are read like labels, projects and tasks: verbatim, with their original ids. Because ids are kept, every reference stays valid with no remapping: `task.section_id`, `task.series_id`, `task.parent_id`, `reminder.task_id`, `view.panels` and `project.parent_id`.
- Why: the `data-import` contract is an exact round trip that keeps ids ("Round trip preserves ids"). Occurrence-record ids are derived from the series id and the date (docs/recurrence.md), so remapping a series id would break the link between a series and its occurrence records. Re-import detection also relies on ids (`exists` / `overwrite`).
- Alternative: give every entity a new id and remap references. This is needed only to import the same export twice into one account side by side, which is not a supported use. Rejected.
- Rows are read in dependency order (labels, projects, sections, tasks, reminders, views). The op log does not need this order, but it keeps the preview readable top-down. A batch boundary between a section and its tasks is harmless, because references are not checked on the sync path.

### D2. Canonical recurrence, carried task fields, assignees
- `task.recurrence` is rewritten to `recurrence.Canonicalize(value)`. The op schema accepts any spelling `Parse` understands, but clients store the canonical form, so the import does too. A rule that fails to parse makes the row an error, as before.
- `notes_doc`, `due` (including `tz`), `ical_extra`, `estimate_minutes`, `series_id` and `section_id` are schema fields and are carried verbatim, unchanged from before.
- `assignee_id` is kept only when it names the importing account. Any other value refers to an account that is not a member here, so `Apply` would refuse it (`not_a_member`). It is dropped with a row warning instead of becoming a refused op.
- The read-only sharing annotations `role` and `owner_id` on exported projects are skipped silently. They are not data, so they should not produce "unknown field" warnings.

### D3. Comments are not imported
Faithful comment import through the op log is impossible for three reasons:
- `comment.author_id` must equal the submitting account. The exported author ids belong to the source account and to other project members.
- Comment creation is rate-limited to 60 per minute per account, so a larger import would see most comments refused.
- Rewriting authorship to the importer would misattribute other members' words.

The preview therefore carries a file-level note ("N comments are not imported …"). Comments do not become per-row results, because thousands of comment rows would crowd the bounded preview list.

### D4. Reminders and their delivery state
- Own export: `delivered_at` and `dismissed_at` are kept verbatim, so a reminder that was handled stays quiet.
- Some live reminders (not deleted) have a `fire_at` that has passed at import time, with no delivery or dismissal at or after that `fire_at`. The scheduler would push all of these right after the import. Instead they get `dismissed_at = import time` and a row warning ("reminder time already passed; imported as dismissed"). The same rule applies to foreign reminders.
- An own-export reminder whose task is neither in the file nor in the account is a row error.
- Foreign reminders become entities in the user's personal scope, as every reminder is:
  - Absolute: a date-time is read like a due date-time in the chosen time zone. A plain date counts as 09:00.
  - Relative: minutes before the due time, giving a negative `offset_minutes`. `fire_at` is computed the way the REST due path computes it: the due date-time in the chosen zone, 09:00 for a date-only due.
  - A relative reminder on a task without a due date gets `fire_at = null` and a warning that it will not fire.
  - Location reminders are dropped with a warning.
- Reminders are created only together with their task. When a task is skipped (already imported, possible duplicate, error), its reminders are skipped too, so a re-import never duplicates reminders.

### D5. Recurrence from other formats
`parseRecurrence(text, due)` tries these steps in order:
1. The rule grammar itself (`recurrence.Canonicalize`).
2. An RRULE (with or without the `RRULE:` prefix) through `recurrence.FromRRULE`, anchored on the due date.
3. A documented set of common spellings, rewritten to the grammar and then canonicalised:
   - `daily`, `weekly`, `monthly`, `yearly`/`annually`
   - `biweekly`/`fortnightly`, `every other <unit>`
   - `every workday`/`weekdays`
   - `every!` (meaning "after completion")
   - a trailing clock time (`every tue 4pm`, `every day at 09:00`) is removed, because the due date-time already carries it.
4. Structured objects `{frequency|freq|type|unit, interval, days|daysOfWeek|byday}`, and arrays of RRULE strings.

Anything else (hourly rules, `starting …`, ordinal lists, intervals with weekday sets) gets the warning `recurrence "<text>" not supported; imported without a rule`. The warning shows in the preview row and counts in `totals.warnings`; it is never silent.

A recurring task without a due date gets the rule's first date from today in the chosen time zone (`Rule.First`), as the app does. A foreign recurring task is a series of its own: it gets `recurrence` and no `series_id`, since only occurrence records carry `series_id`.

There is no Go natural-language parser to reuse (quick add parses in the browser, and it does not parse recurrence), so the importer keeps this small, documented normaliser of its own.

### D6. Sections from other formats
- The `sections` option gains `section`, which becomes the default. A task's section is looked up by name, ignoring case, among the live sections of the task's final project; this includes a project it moved to by joining its parent. A missing section is created once per project, at the next position.
- The `json-items` profile also emits its `sections[]` as rows when the option is `section`. Empty sections are created too, in file order, with source ids, so re-importing the file skips them (`already_imported`).
- Tasks without a project (Inbox) cannot hold a section, because `section.project_id` is required. Their section becomes a label, with a warning.
- `label` and `ignore` keep their old behaviour.
- Creating a section in a shared project needs the same role as creating a task (`CanWrite`), so the existing target-project role check covers it.

### D7. Preview counts and notes
`Totals` gains `newSections` (created sections), `recurring` (created or updated tasks with a rule) and `reminders` (created live reminders). `Plan` gains `notes` (file-level remarks such as uncounted comments). Both changes are additive JSON. The web types mark the new totals optional, because jobs stored before this change lack them.

### D8. Undo
Undo tombstones every entity the job recorded as created, for every kind it wrote: project, task, label, section, reminder and view. As with undone projects and labels, the user's other open tasks that point at an undone section get `section_id = null`.

## Data model impact

None. All fields used already exist in `sync.Schema`, there are no new entities, and no migration (`import_items.entity` is free text).

## Offline and convergence

Import stays an online, server-side job. Everything it writes is ordinary ops with server timestamps and device `import`. Offline devices receive sections, reminders and recurring tasks on their next sync and converge under last-writer-wins like any other write. A device's later edit beats the import.

## Size and memory

There is no new dependency, so the binary size impact is negligible (a few kilobytes of code). Memory is unchanged: the new rows are small, and the own export was already decoded in one piece.

## Risks

- **The default `sections` moves to `section`.** An API client that relied on sections becoming labels gets sections instead. Mitigation: documented in CHANGELOG and docs, and `sections: "label"` restores the old behaviour.
- **Ambiguous recurrence spellings.** The normaliser only rewrites spellings with one obvious meaning, and everything else is a visible warning.
