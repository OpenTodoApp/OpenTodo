# Tasks

## 1. Share target and capture screen

- [x] 1.1 Add `share_target` (GET `/share`, params title/text/url) to the manifest in `web/vite.config.ts`; verify the built `manifest.webmanifest` contains it and `npm run build` passes
- [x] 1.2 `web/src/lib/share.ts`: parse and sanitise the payload (title ≤ 500, text ≤ 16 KB with note, http(s)-only URL, URL-from-text fallback); verify `share.test.ts` covers `javascript:` drop, truncation and URL extraction (`npm test`)
- [x] 1.3 `web/src/app/ShareCapture.tsx` and the `/share` route: quick-add title field, description, project picker, Save on Enter, Cancel on Escape, popup close vs navigate; verify in the browser that `/share?title=Interesting%20article&text=quoted&url=https://example.org/post` saves a task with the expected description and returns to the Inbox
- [x] 1.4 Signed-out flow: hold the payload in memory, route through sign-in, return to the capture screen; verify browser flow on a signed-out device ends on a prefilled capture screen
- [x] 1.5 Offline check: open `/share` with the network off in the installed app, save, reconnect; verify the task reaches a second device after sync (browser flow)

## 2. Bookmarklet

- [ ] 2.1 Settings "Capture" section with a draggable bookmarklet link generated from `location.origin` and a copy button; verify the generated code opens a popup with url, title and selection on a test page and contains no token
- [ ] 2.2 Popup lifecycle: the capture screen closes itself after save when opened as a popup; verify browser flow

## 3. Browser extension

- [ ] 3.1 `extensions/browser/manifest.json` (MV3, permissions `activeTab`, `contextMenus`, `scripting`, `storage`, Firefox settings), `background.js` (action, context menu "Add to OpenTodo", command), `options.html/js` (server URL validation); verify loading unpacked in Chromium and Firefox opens the capture screen with title, selection and URL
- [ ] 3.2 First-run behaviour opens options when no server URL is set, then continues; verify manually and with a small unit test of the URL builder run under `node --test`
- [ ] 3.3 CI job zips `extensions/browser/` as a release asset and checks the manifest declares no host permissions; verify the workflow produces `opentodo-browser-extension.zip`

## 4. Docs and release

- [ ] 4.1 `docs/capture.md` (share sheet per platform, bookmarklet, extension install, limits), README feature list, CHANGELOG under Unreleased; verify links resolve
- [ ] 4.2 Final check: `npm test`, `npm run build`, `go test ./...` unchanged, `make check` passes
