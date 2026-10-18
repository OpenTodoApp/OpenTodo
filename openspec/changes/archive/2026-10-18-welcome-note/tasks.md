## 1. Preference

- [x] 1.1 `user_prefs.welcome` in the server schema, the shared fixture, the client type and defaults
- [x] 1.2 `welcomeSeen` / `setWelcomeSeen` in `web/src/lib/userPrefs.ts`

## 2. Dialog

- [x] 2.1 `WelcomeDialog` with `useWelcome` (owner, not demo, not seen, fresh account) mounted in the shell
- [x] 2.2 Issue, star and coffee links opening a new tab with `noopener`; coffee colour tokens
- [x] 2.3 Tests: shown to the owner of a fresh account, closes for good through a synced op, absent for members, on the demo, on an account in use, and when another device closed it

## 3. Settings → About

- [x] 3.1 `about` section (router, section table, page, search index entries, Help screen `settings/about`) with version, Help, docs, website, issues, source, coffee and the owner's Show it again
- [x] 3.2 Tests: About lists its links for a member without the welcome row; the owner reopens the note

## 4. Docs and checks

- [x] 4.1 `docs/feedback-and-support.md` listed in `docs/README.md`; strings in de, es, fr, it, pt; CHANGELOG
- [x] 4.2 `npx tsc -b`, `npm run lint`, `npx vitest run`, `go test ./internal/sync/...`, `make ui-lint`, `make i18n-check`, `make docs-check`, `make openspec-validate`
