## 1. The Version row

- [x] 1.1 Settings → About shows a Version row whose value is the server's version while online and the build's version otherwise. Verified by `web/src/app/aboutVersion.test.tsx` and `web/src/app/aboutShell.test.tsx`.
- [x] 1.2 The value is a link to the published changelog at the release it shows, and to the page for a version without an anchor. Verified by `changelogUrl()`'s cases in `aboutVersion.test.tsx`.
- [x] 1.3 The build's version reaches the row as `__APP_VERSION__` from `vite.config.ts`'s `define`, not as an import of `package.json`. Verified by `npm run build` and `node scripts/bundle-budget.mjs`.
- [x] 1.4 The settings search finds the row under "version", "changelog", "release notes" and "what is new". Verified by `aboutVersion.test.tsx`.

## 2. Nothing generated

- [x] 2.1 No compiled changelog, no parser, no Makefile target: `make check` and `make ci-checks` are untouched, so `make release-prepare` rewriting `CHANGELOG.md` fails nothing. Verified by `make repo-check` and `git diff` against `main`.
- [x] 2.2 The row costs the bundle one anchor: the entry chunk and its static imports stay within `web/bundle-budget.json`. Verified by `make bundle-budget`.

## 3. Copy and docs

- [x] 3.1 Two messages in every shipped language. Verified by `node scripts/i18n-check.mjs`.
- [x] 3.2 One `changelog.d/Added` entry, one or two sentences.

## 4. Finishing

- [x] 4.1 `make check` passes, including `openspec-validate`.
- [x] 4.2 `cd web && npm run typecheck && npm test && npm run build` pass.
- [x] 4.3 The visual baselines of the About page are refreshed inside the pinned Playwright image (`make ui-baselines`).
