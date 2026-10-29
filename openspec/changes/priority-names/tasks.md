# Tasks

## 1. Data

- [ ] 1.1 Add `priority_name_1`…`priority_name_4` (string, default `""`, `Content: true`) to `user_prefs` in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`; regenerate the op schema and content field lists; verify `go test ./internal/sync/... ./internal/e2ee/...` (the generated `ContentFields` lists the four fields) and `npm test -- e2ee`
- [ ] 1.2 Convergence: a sync test with two devices writing different levels and the same level offline; verify `go test ./internal/sync/ -run PriorityName` and a `prefs.test.ts` case (`npm test`)
- [ ] 1.3 Export and import of the four fields through OpenTodo's own format; verify `go test ./internal/importer/...` round-trip case

## 2. Client

- [ ] 2.1 `web/src/lib/priority.ts` `priorityName(n)` and `priorityAccessibleName(n)` reading the live preference, trimmed, 24-character display truncation, translated default; verify `priority.test.ts`
- [ ] 2.2 Replace every `t('Priority {n}')` and "P1"-style label with the helper: task facts, priority picker, row menu submenu, quick-add and title chips, groups and board columns, filter builder chips, bulk actions, command palette, assistant change-set review, activity and history entries, shortcut overlay; verify the existing tests updated plus `rowLayouts.test.tsx`, `listDisplayPanel.test.tsx`, a filter builder test with a renamed level, and `make ui-lint` with a rule that flags the raw message outside the helper
- [ ] 2.3 Quick add: `p` suggestions with names; names are never parsed as tokens; verify `suggest.test.ts` and a `quickadd.test.ts` case for `Must call Ana`
- [ ] 2.4 Settings → General → Priorities card (screen id `settings/priorities`), live edits, Reset, Help link, settings search keywords, settings copy inventory entry; verify a `priorityNamesCard.test.tsx` (`npm test`), a story in both themes and at 360 px, `make ui-check`
- [ ] 2.5 Encrypted account: names encrypted on write, defaults while locked; verify an `e2ee` client test (`npm test`)
- [ ] 2.6 Translations of the new messages in the five catalogs; verify `make i18n-check`

## 3. Documentation and release

- [ ] 3.1 `docs/labels-and-filters.md` section "Name your priorities", with the note that `p1`–`p4` stay the syntax and agents and the CLI see numbers; `docs/e2ee.md` field list; verify `make docs-check`
- [ ] 3.2 CHANGELOG entry under Unreleased (Added); verify `make docs-check`
- [ ] 3.3 `go test ./...`, `cd web && npm test && npm run build`, `make check` with TZ=UTC
