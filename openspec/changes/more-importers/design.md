# Design

## Context

See proposal.md for the motivation. Relevant current state:

- `internal/importer` reads every file through the `Profile` interface (`Name`, `Description`, `Detect(data)`, `Read(r, opts)`) into normalised `Row`s; `Profiles` (importer.go) is an ordered slice and detection takes the first profile whose `Detect` accepts the bytes. Current order: `opentodo`, `things-db`, `json-items`, `json-lists`, `json-generic`, `todoist-csv`, `ticktick-csv`, `linear-csv`, `csv`. ZIP archives are unpacked before detection and must hold one format.
- `Row` already carries everything the task model has (priority, due, deadline, start, evening, recurrence, reminders, labels, links, `BlockedBySourceIDs`, `AssignSelf`, `Origin`, `EstimateMinutes`), so five of the six profiles need no new row field. It has no custom field values: the foreign planner (`plan_foreign.go`) never writes `fields`, and `KindField` rows exist only for the own export (`plan_own.go`, restored verbatim).
- Dates: `parseDue` and `parseTimestamp` (values.go) read ISO forms and convert instants into the import's zone (`Options.TimeZone`); `parseRecurrence`, `recurrenceFrom` and `structuredRule` (schedule.go) already read RRULEs, the grammar and structured `{frequency, interval, days}` objects; `reminderFrom` reads absolute and relative reminders.
- Fixtures: `testdata/<format>/` holds one sanitised real file and one synthesised `rich.*` per format, each pinned by a golden preview (`named_test.go`, `-update`). `internal/importer/sanitize` scrubs CSV, ZIP and SQLite; it does not know JSON yet.
- The web import screen (`ImportScreen.tsx`) and `web/src/lib/types.ts` list formats by id; `cmd/opentodo --print-formats` feeds the site bundle manifest, which the website reads to decide which "Switch from" pages to show.
- `docs/import.md` has one mapping table per format and `docs/switch/<app>.md` one guide per app, each with an import screenshot produced by `make docs-screenshots`.
- There is no `ot import` command; import is a web and REST feature (`POST /api/v1/import/preview`, `/api/v1/import`).

What a user can actually obtain from each app (October 2026, to be confirmed against the real files in task 1.1):

| App | File a user can get | Shape |
| --- | --- | --- |
| Google Tasks | Google Takeout → Tasks → `Tasks.json` | `{kind: "tasks#taskLists", items: [{kind: "tasks#taskList", id, title, items: [{kind: "tasks#task", id, title, notes, status, due, completed, parent, position, links, deleted, hidden}]}]}` |
| Trello | board menu → Print and export → Export as JSON (`<board>.json`) | `{id, name, shortUrl, closed, lists: [{id, name, closed, pos}], cards: [{id, name, desc, closed, due, dueComplete, start, idList, idLabels, idMembers, idChecklists, shortUrl, labels: [{name, color}], attachments: [{name, url, isUpload}], customFieldItems}], checklists: [{id, name, idCard, checkItems: [{name, state, pos}]}], labels, members: [{id, fullName, username}], actions: [{type: "commentCard", date, memberCreator, data: {text}}], customFields: [{id, name, type, options}]}` |
| Asana | project menu → Export → CSV | header `Task ID, Created At, Completed At, Last Modified, Name, Section/Column, Assignee, Assignee Email, Start Date, Due Date, Tags, Notes, Projects, Parent task, Blocked By (Dependencies), Blocking (Dependencies), <one column per custom field>` |
| Microsoft To Do | none built in; the guide's PowerShell script (`Microsoft.Graph` module, `Get-MgUserTodoList`, `Get-MgUserTodoListTask`) writes one JSON of lists with their tasks; Graph Explorer gives the same objects list by list | `[{id, displayName, wellknownListName, tasks: [{id, title, body: {content, contentType}, importance, status, createdDateTime, completedDateTime: {dateTime, timeZone}, dueDateTime: {dateTime, timeZone}, startDateTime, reminderDateTime, isReminderOn, recurrence: {pattern, range}, categories, checklistItems: [{displayName, isChecked}], linkedResources: [{webUrl, displayName, applicationName}]}]}]` |
| Apple Reminders | none built in; the guide's Shortcut ("Find Reminders" → "Repeat with each" → dictionary → "Combine" → "Save file") writes a JSON array | `[{identifier, list, title, notes, dueDate, isCompleted, completionDate, creationDate, priority, flagged, tags, url, parent, subtasks: [...]}]` |
| Any.do | none built in; Settings → Privacy → Request my data sends a JSON (ZIP) | `{categories: [{id, name, isDefault}], tasks: [{globalTaskId, categoryId, title, note, status, priority, dueDate, repeatingMethod, tags, alert: {type, date}, creationDate, parentGlobalTaskId}]}` |

The Microsoft, Apple and Any.do shapes above are the documented API or data-request shapes; whether a real file matches them in every key is exactly what task 1.1's fixtures establish, and the design records any difference under Implementation notes, as `named-importers` did.

## Goals / Non-Goals

**Goals:**
- A real file from each of the six apps imports with no manual conversion, with a preview that explains every dropped attribute, pinned by a sanitised fixture.
- Custom field values from any profile, including Linear estimates, land as `custom-fields` values of the imported project, created and undone with the import.
- Detection stays exact: no existing fixture changes format; a generic JSON file is never claimed by a named JSON profile.
- No new dependency, no server route, no op schema change.

**Non-Goals:**
- Live connections to any of these services (a later change can generalise `issue-import`'s poller).
- Reading Microsoft's or Any.do's ZIP bundles entry by entry beyond the one JSON the importer needs (the existing ZIP handling already picks data files and refuses mixed formats).
- A CLI import command.

## Decisions

**D1. Six profiles, three of them over scripted files.** Google Tasks, Trello and Asana have real exports and get profiles over them. Microsoft To Do, Apple Reminders and Any.do have none; rather than leave them out or pretend, each gets a profile over the one file a user can realistically produce, with the recipe in its switch guide, and the format's description in the UI says where the file comes from ("Microsoft To Do: the JSON written by the guide's script"). Alternatives: (a) CSV-only guides ("convert to our columns"): rejected, that is the status quo; (b) OAuth connectors that pull from the Graph, Google Tasks and Any.do APIs: rejected for this change, they add credentials, outbound requests and owner switches (the `issue-import` pattern) and belong in a connectors change; (c) Apple Reminders through CalDAV only: kept as the recommended path in the guide, but a one-time copy through a Shortcut serves people who do not want to run CalDAV, and the Shortcut JSON is cheap to read.

**D2. Detection order and signatures.** New JSON profiles are inserted after `things-db` and before `json-items`, each with a structural signature that no generic file has: Google (`kind` `tasks#taskLists`/`tasks#taskList`), Trello (`lists` + `cards` + `checklists` + `id` at the top), Microsoft (`wellknownListName`, or `importance` + `dueDateTime` on a task), Apple (`identifier` + `isCompleted` on every element), Any.do (`categories` + `tasks` with `categoryId`). `asana-csv` goes before `csv` and detects on `Task ID` + `Section/Column` + `Parent task` + `Completed At` (a generic CSV with a `title` column never has these). A detection test runs every fixture of every format through `Parse` and asserts the format, so a signature that overlaps fails loudly (existing test in `profiles_test.go` extended). Alternative: detecting by product name in the file (`"kind": "tasks#..."` is one, but Trello and Asana carry none): rejected for the rest, structure only, as `named-importers` D1 decided.

**D3. Custom fields in the foreign planner.** `Row` gains `Fields []FieldValue` with `{Name, Type, Value}` (`Type` one of `number`, `text`, `choice`, `checkbox`, `date`). The planner adds a pass between sections and tasks: for each project that receives rows with fields, it reads the project's live definitions from `State.Fields` (already loaded for the own export), matches by case-insensitive name; a match of the same type is reused, a match of another type drops the values with a row warning, no match plans a `KindField` create (`project_id`, `name`, `type`, `options` for a choice built from the file's distinct values in first-seen order, `position`, `created_at`), subject to the 30-definition limit (`custom-fields`), and the task change gets `fields: {<definition id>: value}`. Created definitions are recorded in the job like any other created entity, so undo removes them. Tasks whose project is the Inbox get a warning and no values (fields belong to a project). Choice inference for Asana: a text column with at most 10 distinct non-empty values is a choice field; above that, text. Alternatives: (a) one text field per column: loses numbers and filters; (b) always create definitions even when a same-name field of another type exists: would make the panel show mismatched values ("Typed values and their limits" says a mismatch shows as not matching), so refuse instead.

**D4. Linear estimates.** `profile_linear.go` removes `Estimate` from `linearDropped` and emits `Fields: [{Name: "Estimate", Type: number, Value: <points>}]`. The existing Linear fixtures' goldens change (one definition created, the warning gone) and the change states that difference, as the "Named formats are verified" requirement demands.

**D5. Dates per app.** Google Tasks `due` is midnight UTC with no time meaning: take the date part verbatim (never convert, or users west of UTC lose a day). Microsoft `dateTimeTimeZone` objects name a Windows zone ("Pacific Standard Time"): a small table maps the Windows names Graph emits to IANA names (about 140 entries, generated into `internal/importer/windowszones.go` from the CLDR `windowsZones.xml` mapping with a script kept next to it; stdlib only), falling back to the import's zone with a warning for an unknown name; due dates are date-only, reminders are instants. Trello `due` is a UTC instant: convert to the import's zone and keep the time. Asana `Due Date` is `YYYY-MM-DD` (a time comes in the same cell as `YYYY-MM-DD HH:MM` in some exports; both read). Apple Shortcuts write ISO 8601 with an offset: convert. Any.do `dueDate` is Unix milliseconds: convert, and midnight in the import's zone means date-only. Alternative: one parser for all: rejected, the midnight conventions differ per app and are the main source of off-by-one-day bugs in importers.

**D6. Recurrence per app.** Microsoft's `recurrence.pattern` maps to `structuredRule`'s shape (type, interval, daysOfWeek, dayOfMonth, month) and the range's `endDate`/`numberOfOccurrences` are dropped with a warning (the grammar has no end). Any.do's `repeatingMethod` constants map to `every day|week|month|year`. Trello, Asana and Google Tasks files carry no recurrence (Asana's export loses it; the guide says so). Apple's Shortcut output has none (Shortcuts cannot read the rule); the guide says CalDAV carries it.

**D7. Comments and people.** Trello comments are appended under a "Comments" heading with author name and date (same rule as Todoist notes: authors cannot be kept, one warning per task). Members and assignees are dropped with a warning unless they are the importing user (Asana by email as Linear does; Trello by `fullName` or `username` against the account's name, best effort, documented).

**D8. Attachments.** URLs become link attachments through `Row.addLink`; uploaded files are dropped with a warning naming them (Trello `isUpload`, Microsoft `attachments` not in the export, Any.do attachments). Nothing is fetched: the importer never makes a network request.

**D9. Sanitiser.** `internal/importer/sanitize` gains a JSON mode: it walks the document and replaces the values of a per-format list of text keys (`title`, `name`, `desc`, `notes`, `note`, `body.content`, `displayName`, `fullName`, `username`, `text`, `url` hosts kept but paths scrubbed, emails) with stable placeholders, keeping structure, ids, dates, statuses and numbers. CSV mode already serves Asana. Review by hand before commit, as before.

**D10. Where the website gets the formats.** `--print-formats` lists the profiles, the site bundle manifest carries them, the website gates its "Switch from" pages on the manifest ("Website reads released importers"). So the website gains the six pages when the release ships, without a change in this repository; the website's own change adds the pages and comparison lines. The documentation site shows the six switch guides from `docs/switch/`.

**D11. Interface budget.** The import screen gains six entries in the format `<select>` and nothing else; no new chrome, no new shortcut, no new sidebar destination. The format menu is inside the page body as today.

**D12. Size.** Six profiles of plain Go, the Windows zone table (about 8 KB of source) and the planner pass: about 60–90 KB on the 23 MB binary; no new module. The web bundle gains six translated labels in five catalogs (about 0.3 KB gzipped). Runtime memory: files are read whole as today, within the upload limit; nothing new is held.

## Risks / Trade-offs

- [Microsoft, Apple and Any.do files are produced by recipes, not by the apps, so users may bring a slightly different file] → the profiles fail soft per row (unknown keys ignored, bad values warned), the guide pins the exact recipe, the format description in the UI names it, and the "Named formats are verified" requirement pins the recipe's output; variants arrive as user-reported fixtures.
- [Any.do's data-request JSON is undocumented and may change] → stated in the docs; detection is structural; a changed file falls to the generic JSON profiles or `unsupported_format`, never to a wrong mapping.
- [Trello board exports can be large (every action)] → actions are filtered to `commentCard` while decoding; the 50,000-row and upload limits apply; a board with more comments than that still imports its cards.
- [Windows zone names outside the table] → fallback to the import's zone with a warning naming the zone; the table is generated from CLDR and can be regenerated.
- [Choice inference from Asana columns guesses] → the threshold (10 distinct values) is documented; a wrong guess is still a usable text or choice field, and the user can change the type in Fields after import (definitions cannot change type, so the guide says to delete and recreate if needed; the preview shows the inferred type per column before anything is written).
- [Goldens of the Linear fixtures change] → the change states the difference (estimates now create a field); the diff is reviewed in the pull request.

## Migration Plan

Nothing to migrate: no schema, no settings. Deploy with the release; older web apps show the new formats by id until updated (the format select falls back to the id). Rollback: the profiles are code only.

## Open Questions

- Whether Asana's export writes a time in `Due Date` or a separate `Due Time` column in the current export (both are read; the fixture settles which the docs table shows).
- Whether Trello's `customFieldItems` are present in the JSON export without a Power-Up enabled (the profile reads them when present; the fixture decides whether the docs mention them).
