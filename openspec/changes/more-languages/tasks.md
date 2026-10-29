# Tasks

## 0. Before starting

- [ ] 0.1 Name the Dutch reviewer (a native speaker) in the pull request and in `docs/translating.md`'s maintainer table; without one, stop after section 2 and leave `nl` unlisted (design D2); verify the reviewer has approved the catalog in the pull request before 3.1 is ticked

## 1. Contributor kit

- [ ] 1.1 `scripts/i18n/new-language.mjs` scaffolding every surface (design D5), refusing invalid or existing codes and never editing `SHIPPED`, `mail.Languages`, the channels table or `quickadd.Bundled`; verify `node --test scripts/i18n/new-language.test.mjs` (scaffold into a temporary copy, existing code refused, no file changed on refusal) and `make repo-check`
- [ ] 1.2 `scripts/i18n/status.mjs` and `make i18n-status`: language × surface table with translated / total and the first missing keys, read-only; verify `node --test scripts/i18n/status.test.mjs` against a fixture tree
- [ ] 1.3 Community tier: optional `community: true` in `SHIPPED`, the 90 % threshold in `scripts/i18n-check.mjs` (fail below it for a listed community catalog, report above it), English fallback for the other surfaces; verify `node --test scripts/i18n/*.test.mjs` (85 % fails, 94 % passes and reports missing keys)
- [ ] 1.4 Language panel: community languages after maintained ones with the caption "Community translation, some text in English"; verify a `LanguagePanel` test (`npm test`) with a fixture community entry and a story in both themes
- [ ] 1.5 Cross-surface check (design D6): a Go test that `mail.Languages`, the channels message table and `quickadd.Bundled` contain every maintained code from `web/src/locales/index.ts`, and the push-sw and extension tests extended the same way; verify `go test ./internal/mail/... ./internal/channels/... ./internal/quickadd/...` and `npm test`

## 2. Dutch quick-add vocabulary

- [ ] 2.1 `web/src/lib/nlp/vocab/nl.ts` and the `nl` entry in `internal/quickadd/vocab.json` (design D3), including `half` times, `'s ochtends/middags/avonds` and the `guardedAbbreviations` list read by both parsers; add `nl` to `quickadd.Bundled` and the TS bundle list; verify `npm test -- nlp` and `go test ./internal/quickadd/...`
- [ ] 2.2 Shared vectors: Dutch rows in `web/src/lib/nlp/quickadd.vectors.json` for every line of the D3 table, the abbreviation guard, `half 4` and the inactive-Dutch English titles; verify `vectors.test.ts` (`npm test`) and `go test ./internal/quickadd/ -run Vectors` agree
- [ ] 2.3 Token suggestions and the "unmatched token" hints include Dutch words; verify `suggest.test.ts`

## 3. Dutch everywhere

- [ ] 3.1 `web/src/locales/nl.json`, complete and reviewed; then add `{ code: 'nl', name: 'Nederlands' }` to `SHIPPED`; verify `make i18n-check` and `make ui-lint`
- [ ] 3.2 Service worker notification texts (`web/public/push-sw.js`) and `extension/_locales/nl/messages.json`; verify `npm test` and `make test-extension`
- [ ] 3.3 Android shell `values-nl/strings.xml`; verify `scripts/i18n/shell.test.mjs` and `make android` where the SDK is available
- [ ] 3.4 Server: `internal/mail/templates/*.nl.txt`, `nl` in `mail.Languages` with plural units and role names, the Dutch row in `internal/channels/messages.go`; verify `go test ./internal/mail/... ./internal/channels/...` (digest fixture rendered in Dutch, channel generic texts in Dutch)
- [ ] 3.5 Date and number formatting in Dutch (`Intl` with `nl`): relative day words, month names, `1.234` grouping; verify a `dates.test.ts` case and the Plural scenario for Dutch in `i18n.test.ts`

## 4. Documentation and release

- [ ] 4.1 `docs/translating.md`: "Adding a language, step by step" with the two commands, the community tier, the Dutch glossary column and register, writing a quick-add vocabulary with vectors; `docs/language.md` lists Dutch; `docs/quick-add.md` Dutch examples; verify `make docs-check`
- [ ] 4.2 `.github/ISSUE_TEMPLATE/translation.yml` asking for the language, the maintainer and the surfaces; verify `make repo-check`
- [ ] 4.3 CHANGELOG entry under Unreleased (Added: Dutch, community languages, translation kit); verify `make docs-check`
- [ ] 4.4 `go test ./...`, `cd web && npm test && npm run build` (the Dutch chunk is lazy: `make bundle-budget` unchanged), then `make check` with TZ=UTC
