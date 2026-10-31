# Tasks

## 1. Preference

- [x] 1.1 `internal/sync/ops.go` `Schema`: `user_prefs.formatting_toggle` (string, default `""`, not content) with its comment; `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema` regenerates `web/src/generated/opSchema.ts`, `internal/e2ee/contentfields.go` and the contract fixture; verify `go test ./internal/sync/... ./internal/e2ee/...`
- [x] 1.2 `web/src/lib/types.ts` and a read helper `formattingButtonOn(prefs)` (`off` hides, anything else shows, never rewritten); verify `npm test`

## 2. Toolbar and toggle

- [x] 2.1 `web/src/app/EditorChrome.tsx`: the row as a roving-focus toolbar (one Tab stop; Left, Right, Home, End; Escape back to the editor; commands return focus to the editor); verify a happy-dom test of the key handling and `make ui-check` for the row's story
- [x] 2.2 `FormattingToggle` and `useFormattingRow('notes' | 'comments')` (device `localStorage` with try/catch, default off, `storage` event across tabs); verify unit tests (remembered per surface; storage that throws reads as off and still renders)
- [x] 2.3 `web/src/app/NotesEditor.tsx`: the toggle at the note's top end corner with `.ui-reveal`, before the text in DOM order, only for editable notes on a fine pointer and while the setting is on; the row with `always` while pressed; verify happy-dom tests (mouse bold, keyboard path of the spec scenario, viewer has no toggle, coarse pointer unchanged, setting off hides toggle and row)
- [x] 2.4 `web/src/app/task-detail/Composer.tsx`: use the shared toggle and `useFormattingRow('comments')`; hidden while the setting is off; verify the existing composer tests and a new one for the remembered row

## 3. Setting

- [x] 3.1 How you work: **Formatting button** row with a switch writing `user_prefs.formatting_toggle`; copy in `web/src/lib/settingsCopy.ts` within the copy limits; settings search finds "formatting" and "toolbar"; verify `settingsCopy.test.ts`, `settingsSearch.test.tsx`, a happy-dom test that turning it off hides the note toggle
- [x] 3.2 Strings in the six catalogs (en, de, fr, it, es, pt); verify `make i18n-check`

## 4. Design system and docs

- [x] 4.1 Stories: the note with the toggle at rest, hovered and pressed; the toolbar's focus states; baselines; verify `make ui-lint` and `make ui-check`
- [x] 4.2 docs/formatting.md (the toggle on a computer, the setting, keyboard use of the row) and the How you work guide; verify `make docs-check`
- [x] 4.3 CHANGELOG Unreleased entry (at archive)
- [x] 4.4 `npm test`, `npm run build`, `make bundle-budget`, `go test ./...`, `make check`, `make openspec-validate`
