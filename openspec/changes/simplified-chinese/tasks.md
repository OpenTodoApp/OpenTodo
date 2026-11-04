## 1. Language resolution

- [x] 1.1 Classify Chinese tags in `web/src/lib/i18n/locale.ts` (design D2): `zh`, `zh-Hans`, `zh-CN`, `zh-SG` and any `Hans` tag resolve to `zh` once `zh` is shipped; `zh-Hant`, `zh-TW`, `zh-HK`, `zh-MO`, any `Hant` tag and any other `zh` tag do not; the browser list is walked in order; the Intl locale keeps `zh-CN` when the browser tag itself resolves to `zh`, else `zh`. Verify `web/src/lib/i18n/i18n.test.ts` (`cd web && npm test -- i18n`): `zh-CN` → `zh`, `zh-TW` alone → `en`, `zh-TW` then `zh-CN` → `zh`, a chosen `zh` on an `en-US` browser uses locale `zh`, an unknown code still reads as `system` and the stored value is unchanged
- [x] 1.2 Set the document `lang` to `zh` and leave `dir` as `ltr`. Verify the same test: switching to Simplified Chinese sets `document.documentElement.lang` to `zh` and does not set `dir` to `rtl`

## 2. Text layout

- [x] 2.1 Set `line-break: strict` on the document root (design D5). Leave `.user-text` on `overflow-wrap: anywhere`. Do not add a font file and do not widen the Inter `unicode-range`. Verify a layout test that a wrapping note keeps `。` and `，` with the previous character, and `cd web && npm run build` shows no new font asset and `make bundle-budget` still passes (the Chinese catalog, once added, is a lazy chunk and not in the first load)
- [x] 2.2 Truncation of a title with no spaces still ends in an ellipsis and still exposes the full title. Verify the existing truncation assertion in a row test with a Chinese title that contains no spaces (`cd web && npm test`)

## 3. Input method

- [x] 3.1 In `TitleField` and quick add, ignore Enter while an input method is composing (`isComposing` or key code 229, design D6), in every language. Enter after composition still commits. Verify `web/src/app/titleField.test.tsx` and `web/src/app/quickAdd.test.tsx` (`cd web && npm test`): a composing Enter does not save the title and does not create a task; Enter after composition does, including the offline quick-add case

## 4. Catalogs

- [x] 4.1 Record peilf (discussion #882) as the reviewer who reads the catalog after it is listed (design D3). Naming is in `docs/translating.md`; listing does not wait for the review
- [x] 4.2 `web/src/locales/zh.json`, complete against the committed English messages, plural entries using only `other`. Verify `node scripts/i18n-check.mjs` against those messages (a fixture entry that adds a `one` branch for `zh` fails) and `cd web && npm test -- i18n`
- [x] 4.3 Service worker texts in `web/public/push-sw.js` and `extension/_locales/zh/messages.json`, present before `zh` is listed. Verify `cd web && npm test` and `make test-extension`
- [x] 4.4 Android `values-zh/strings.xml`. Verify `node --test scripts/i18n/shell.test.mjs`
- [x] 4.5 `internal/mail/templates/*.zh.txt` and the digest golden file for `zh`. Verify `go test ./internal/mail/...` (a `zh-CN` password reset is Simplified Chinese, a `zh-TW` reset stays English, the digest fixture matches the `zh` golden file and does not contain "overdue" or its Chinese translation)
- [x] 4.6 Simplified Chinese rows in `internal/channels/messages.go`. Verify `go test ./internal/channels/...`: a channel saved in `zh` sends the Chinese text for "A reminder is due" with titles off, and not the English sentence

## 5. Offer the language

- [x] 5.1 Add `{ code: 'zh', name: '简体中文' }` to `SHIPPED`, `zh` to `mail.Languages` and to the channel and service-worker language lists. Verify `make i18n-check`, the Language panel test (`System (简体中文)` when the browser prefers `zh-CN`, seven languages listed), and `go test ./internal/mail/... ./internal/channels/...`
- [x] 5.2 Dates for locale `zh-CN` come from the existing `Intl` formatters (a date renders with 年). Verify a case in `web/src/lib/dates` tests (`cd web && npm test`). Quick add is unchanged: with only `zh` preferred, `activeLanguages` still ends on English. Verify `web/src/lib/nlp/vocab.test.ts`

## 6. Documentation and release

- [x] 6.1 `docs/language.md` lists 简体中文. `docs/translating.md` gains a Simplified Chinese glossary column and names the reviewer. Add this change to the 0.21 table in `ROADMAP.md` beside `more-languages`. Verify `make docs-check`
- [x] 6.2 CHANGELOG entry under Unreleased (Added: Simplified Chinese). Verify `make docs-check`
- [ ] 6.3 `go test ./...`, then `cd web && npm test && npm run build`, then `make check` with TZ=UTC
