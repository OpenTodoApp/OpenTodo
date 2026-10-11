# Tasks

## 1. Own export completeness (Go)

- [x] 1.1 `opentodo` profile reads `sections`, `reminders` and `views` (in dependency order) and counts `comments` into a file-level note; verify `TestOwnExportReadsAllEntities` (`go test ./internal/importer/`)
- [x] 1.2 Planner: canonical `task.recurrence`, assignee kept only for the importing account, project annotations skipped silently, reminders whose task is missing are row errors, past undelivered reminders imported dismissed; verify `TestOwnExportRecurrenceAssigneeReminders` (`go test ./internal/importer/`)
- [x] 1.3 Round trip over HTTP with sections, a recurring series with an occurrence record, absolute and relative reminders, a view, `notes_doc`, `due.tz`, `ical_extra`, `estimate_minutes`: export → import into a fresh account → export is equal except comments; verify `TestRoundTripExportImportExport` (`go test ./internal/httpapi/`)

## 2. Other formats (Go)

- [x] 2.1 `parseRecurrence` (grammar, RRULE, documented spellings, structured objects) with a table test including unsupported strings; verify `TestParseRecurrence` (`go test ./internal/importer/`)
- [x] 2.2 Reminder parsing (absolute, minutes before, ISO durations, objects, location dropped) and planner reminder entities with `fire_at` from the due in the chosen zone; verify `TestParseReminder` and `TestForeignRemindersPlanned` (`go test ./internal/importer/`)
- [x] 2.3 Profiles map recurrence, reminders and sections: CSV columns `recurrence`/`reminder`, `json-generic`, `json-items` (sections, reminders, `due.string`), `json-lists`; fixtures updated; verify `TestCSVMappingAndRowErrors`, `TestProfile_json_generic`, `TestProfile_json_items`, `TestProfile_json_lists` (`go test ./internal/importer/`)
- [x] 2.4 `sections: section` default: match by name per project, create once, empty `json-items` sections created with source ids, Inbox fallback to label; verify `TestSectionsOption` and `TestForeignSectionsCreatedAndReused` (`go test ./internal/importer/`)
- [x] 2.5 Preview totals `newSections`, `recurring`, `reminders` and `notes`; unsupported recurrence is a warning in the preview; verify `TestPreviewCountsCompleteness` (`go test ./internal/importer/`)

## 3. Undo

- [x] 3.1 Undo tombstones created sections, reminders and views and clears `section_id` of other open tasks in undone sections; re-import after undo works; verify `TestUndoRemovesSectionsAndReminders` (`go test ./internal/importer/`)

## 4. Web app

- [x] 4.1 `types.ts` option `sections: 'section' | 'label' | 'ignore'`, optional totals `newSections`/`recurring`/`reminders`, `notes`, row kinds; Import screen offers the section option (default) and shows the new counts and notes; verify `importScreen.test.tsx` (`cd web && npm test && npm run build`)

## 5. Docs and checks

- [x] 5.1 `docs/import.md` mapping tables, recurrence spellings, reminders, sections, what is not imported and why; CHANGELOG.md Fixed entry; verify the docs match `TestParseRecurrence` cases by reading them side by side
- [x] 5.2 `npx --yes @fission-ai/openspec@latest validate --all --strict` and `make check` pass
