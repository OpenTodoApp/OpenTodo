## 1. Catalog and listing

- [x] 1.1 `web/src/locales/ja.json` with every message of `messages.json`, plurals using only `other`, the glossary's Settings names in every "Settings → …" path. Verify `make i18n-check` passes (ja 100 %, community).
- [x] 1.2 `{ code: 'ja', name: '日本語', community: true }` in `SHIPPED`; update the tests that list the shipped languages. Verify `cd web && npx vitest run src/lib/i18n src/app/languageSettings.test.tsx src/lib/settingsCopy.test.ts`: `ja-JP` resolves to `ja`, `lang` is `ja` and `dir` unchanged, `1件のタスク` and `1,234件のタスク`, `11月4日水曜日`, `2027/11/04`, `2027年11月4日`, and 日本語 listed after Русский.

## 2. Small surfaces

- [x] 2.1 Japanese texts in the service worker table (`web/public/push-sw.js`) and the browser-too-old notice (`web/public/browser-check.js`). Verify `npx vitest run src/lib/pushWorker.test.ts src/lib/browserCheck.test.ts`.
- [x] 2.2 Japanese weekday names and the year-first order for note-template placeholders in `web/src/lib/noteTemplateFill.ts` and `internal/templatelib/placeholders.go`, with a Japanese row in the shared vectors. Verify `npx vitest run src/lib/noteTemplates.test.ts` and `go test ./internal/templatelib/`.

## 3. Input method

- [x] 3.1 The plain comment composer ignores Enter while an input method is composing. Verify the new case in `web/src/app/task-detail/groupMentions.test.tsx`: a composing Enter neither picks the mention nor sends, Enter afterwards picks it.

## 4. Documentation and release

- [x] 4.1 `docs/translating.md` (languages, the maintainers' draft rule, the maintainer row, the register and a 日本語 glossary column), `docs/language.md`, `docs/contributing/add-a-language.md`, and the 0.21 row in `ROADMAP.md`. Verify `make docs-check`.
- [x] 4.2 Changelog fragment `changelog.d/Added/japanese.md`. Verify `make repo-check`.
- [x] 4.3 `make openspec-validate`, `cd web && npm test && npm run build`, `make bundle-budget` (the catalog is a lazy chunk). Verify all pass.

## 5. After the review

- [ ] 5.1 A native speaker reviews the catalog in a pull request and is named in the maintainer table. Verify the reviewer's approval on that pull request.
