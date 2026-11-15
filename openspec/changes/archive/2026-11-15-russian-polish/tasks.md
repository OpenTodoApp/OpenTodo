## 1. Catalogs

- [x] 1.1 `web/src/locales/ru.json` and `pl.json` with every message of `messages.json`, plurals in `one`/`few`/`many`/`other`, the glossary's Settings names. Verify `make i18n-check` passes.
- [x] 1.2 List both in `SHIPPED` with `community: true`; update tests that list the shipped languages. Verify `cd web && npm test -- i18n languageSettings` passes.

## 2. Docs

- [x] 2.1 `docs/translating.md`: the machine-draft rule, the maintainer table rows, the glossary columns; `docs/contributing/add-a-language.md`; `docs/language.md`. Verify `make docs-check` passes.
- [x] 2.2 Changelog fragment `changelog.d/Added/russian-polish.md`. Verify `make repo-check` passes.

## 3. Checks

- [x] 3.1 `make openspec-validate`, `cd web && npm test && npm run build`, `make bundle-budget`. Verify all pass.
