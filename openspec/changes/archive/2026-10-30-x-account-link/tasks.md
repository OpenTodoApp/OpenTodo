# Tasks

## 1. Client link

- [x] 1.1 Add `X_URL` to `web/src/app/WelcomeDialog.tsx` (D1), the News and updates row to `web/src/app/AboutSection.tsx` with its copy in `web/src/lib/settingsCopy.ts` and its entry in `web/src/app/settingsIndex.ts` (D2); extend the About test so `links()` includes `x: X_URL` for a member and the settings search for "twitter" and "news" returns the row; verify with `cd web && npm test -- welcomeDialog settingsSearch`.
- [x] 1.2 Add the three new messages to `de.json`, `es.json`, `fr.json`, `it.json` and `pt.json` under `web/src/locales/`, run `node scripts/i18n/extract.mjs --write`, and verify `make i18n-check` passes with no missing or unused entry.

## 2. Documentation and README

- [x] 2.1 Add the "Follow the news" section to `docs/feedback-and-support.md` and name the row in its Settings → About paragraph (D4); verify with `make docs-check`.
- [x] 2.2 Add the X account to the "Questions, ideas and bug reports" line of `README.md`; verify with `make repo-check`.
- [x] 2.3 Add a CHANGELOG.md entry under Unreleased → Added naming the X link in Settings → About and Help; verify the entry links the docs page.

## 3. Integration check

- [x] 3.1 Run `make openspec-validate`, `cd web && npm test && npm run build`, `make i18n-check`, `make docs-check` and `make repo-check`, and verify they pass.
