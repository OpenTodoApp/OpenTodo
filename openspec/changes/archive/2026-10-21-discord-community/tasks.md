# Tasks

## 1. Client links

- [x] 1.1 Add `DISCORD_URL` to `web/src/app/WelcomeDialog.tsx` and a Discord `LinkRow` to `WelcomeNote` (D2); extend `welcomeDialog.test.tsx` so the note's anchors include the Discord address with `target="_blank"` and `rel` containing `noopener`; verify with `cd web && npm test -- welcomeDialog`.
- [x] 1.2 Add the `messages-square` icon to `web/src/ui/icons/names.json`, regenerate `lucide.ts` with `scripts/icons-sync.mjs` against the pinned lucide-static version, and verify `make ui-lint` and `cd web && npm run build` pass.
- [x] 1.3 Add the Community row to `web/src/app/AboutSection.tsx` (D3) and its entry to `web/src/app/settingsIndex.ts`; extend the About test so `links()` includes `discord: DISCORD_URL` for a member and the settings search for "discord" and "community" returns the row; verify with `cd web && npm test -- welcomeDialog settingsIndex`.
- [x] 1.4 Add the new messages to `de.json`, `es.json`, `fr.json`, `it.json` and `pt.json` under `web/src/locales/`, run `node scripts/i18n/extract.mjs --write`, and verify `make i18n-check` passes with no missing or unused entry.

## 2. Documentation and README

- [x] 2.1 Add the "Talk to other people" section to `docs/feedback-and-support.md`, update its summary and the About paragraph, and mirror the summary in `docs/README.md` (D5); verify with `make docs-check` and by opening Help → Feedback and support in `make dev`, where the link opens Discord in a new tab.
- [x] 2.2 Add the Discord invite to `README.md` in the "Questions, ideas and bug reports" line and under Contributing; verify with `make repo-check` and by reading the rendered README.
- [x] 2.3 Add a CHANGELOG.md entry under Unreleased → Added naming the Discord link in the welcome note, Settings → About and Help; verify the entry links the docs page.

## 3. Integration check

- [x] 3.1 Run `make check` (lint, web tests and build, i18n, ui-lint, docs, openspec validate) and verify it passes; in `make dev`, create a fresh owner account and verify the welcome note shows issue, Discord, star and coffee links, and Settings → About shows the Community row while offline too.
