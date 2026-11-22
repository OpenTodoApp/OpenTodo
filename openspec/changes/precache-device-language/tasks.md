# Tasks

Web tasks run `npm test` and `npm run build` in `web/`. The server doesn't change; `make check` runs `go test ./...` before the last task.

## 1. Build and signed list

- [x] 1.1 `web/vite.config.ts`: `chunkFileNames` names a chunk whose facade module is `src/locales/<code>.json` `assets/lang-<code>-<hash>.js`; `globIgnores` unchanged (D1, D4). Verified by `npm run build`: `internal/web/dist/assets` holds one `lang-<code>-*.js` per shipped catalogue and none for `aisles/*.json`; `make bundle-budget` passes.
- [x] 1.2 `web/scripts/app-manifest.mjs`: `loadOf` returns `lazy` for `assets/lang-*`, and the entry carries `lang` (D2). `web/src/lib/appCode.ts` `ManifestFile` gains the optional `lang`. Verified by `app-manifest.test.mjs` (a catalogue is lazy with its language, an aisle vocabulary is install, the Workbox globs still match every other file).

## 2. Service worker

- [x] 2.1 `web/src/lib/appInstall.ts` `stage()`: the queue adds every `lazy` file with a `lang` whose language has a stored catalogue in the current set; a failed one fails the install as an `install` file does (D3). Verified by `appInstall.test.ts`: first install stores no catalogue; after a German catalogue was stored through `fetchLazy`, an update stores the new German catalogue and no other; a changed German catalogue with refusal on refuses the update.
- [x] 2.2 End to end: `scripts/e2e-language.mjs` (in `scripts/e2e.sh`) opens the app in German, checks the German catalogue is in the app's cache and the French one is not, reloads offline and sees German. Verified by `make e2e`.

## 3. Documentation and release

- [x] 3.1 `docs/` page on languages and the offline page: a language works offline once it has been used on the device; picking a new one offline waits until online. Verified by `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Changed/precache-device-language.md`. Verified by `make repo-check`.
- [ ] 3.3 `npm test`, `npm run build`, `make openspec-validate` and `make check` pass. Verified by their exit codes.
